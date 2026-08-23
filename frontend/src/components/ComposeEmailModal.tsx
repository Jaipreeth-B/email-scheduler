"use client";

import { useState, useRef } from "react";
import axios from "axios";
import Papa from "papaparse";
import { X, Upload, Send } from "lucide-react";
import { useSession } from "next-auth/react";

interface ComposeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ComposeEmailModal({ isOpen, onClose }: ComposeEmailModalProps) {
  const { data: session } = useSession();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [leads, setLeads] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const emails = results.data
          .map((row: any) => row[0])
          .filter((email) => email && typeof email === 'string' && email.includes('@'));
        setLeads(emails);
      },
      error: (error) => {
        setError("Failed to parse CSV file.");
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leads.length === 0) {
      setError("Please add at least one lead (recipient).");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const token = "mock-token"; // We would get this from NextAuth in a real scenario
      const payload = {
        subject,
        body,
        leads,
        scheduledAt: new Date(scheduledAt).toISOString(),
        hourlyLimit,
        delayMinutes,
        userId: (session?.user as any)?.id || "anonymous",
      };

      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/campaigns`, payload);

      // Reset and close
      setSubject("");
      setBody("");
      setLeads([]);
      setScheduledAt("");
      setHourlyLimit(100);
      setDelayMinutes(0);
      onClose();
      // Need a way to trigger table refresh ideally, or reload
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create campaign.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Compose Campaign</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form id="compose-form" onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-100 focus:border-blue-500 hover:border-gray-400 transition-all duration-150 outline-none text-gray-900 placeholder:text-gray-500 shadow-sm"
                placeholder="Exciting news!"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Body</label>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-100 focus:border-blue-500 hover:border-gray-400 transition-all duration-150 outline-none resize-y text-gray-900 placeholder:text-gray-500 shadow-sm"
                placeholder="Write your email here..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Leads (CSV Upload)
                <span className="ml-2 text-gray-400 font-normal">First column should be email</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 active:bg-gray-100 active:scale-95 transition-all duration-150 cursor-pointer focus-visible:ring-4 focus-visible:ring-blue-100 outline-none shadow-sm"
                >
                  <Upload size={16} />
                  Upload CSV
                </button>
                <span className="text-sm text-gray-500">
                  {leads.length > 0 ? `${leads.length} leads loaded` : "No leads selected"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule Time
                </label>

                <input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full h-12 px-4 border border-gray-300 rounded-xl bg-white text-gray-900 text-sm shadow-sm outline-none transition-all hover:border-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />

                <p className="mt-1.5 text-xs text-gray-500">
                  Select a date and time, for example: Aug 23, 2026 at 6:45 PM.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hourly Limit</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-100 focus:border-blue-500 hover:border-gray-400 transition-all duration-150 outline-none text-gray-900 placeholder:text-gray-500 shadow-sm"
                  placeholder="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delay between emails (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-100 focus:border-blue-500 hover:border-gray-400 transition-all duration-150 outline-none text-gray-900 placeholder:text-gray-500 shadow-sm"
                  placeholder="0"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all duration-150 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-gray-300 outline-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="compose-form"
            disabled={isLoading}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all duration-150 cursor-pointer focus-visible:ring-4 focus-visible:ring-blue-200 outline-none font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:bg-blue-600"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={18} />
            )}
            Schedule Campaign
          </button>
        </div>
      </div>
    </div>
  );
}
