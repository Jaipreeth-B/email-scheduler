"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import { Mail, Clock, RefreshCw } from "lucide-react";

interface ScheduledEmail {
  id: string;
  campaignId: string;
  recipient: string;
  status: "PENDING" | "SCHEDULED";
  scheduledAt: string;
  campaign: {
    subject: string;
  };
}

export default function ScheduledEmailsTable() {
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEmails = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.get("http://localhost:3001/api/emails/scheduled");
      setEmails(res.data);
    } catch (err) {
      setError("Failed to load scheduled emails.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <RefreshCw className="animate-spin mb-4" size={32} />
        <p>Loading scheduled emails...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-500">
        <p>{error}</p>
        <button onClick={fetchEmails} className="mt-4 text-blue-600 hover:text-blue-700 underline text-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1 transition-colors">
          Try again
        </button>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <div className="bg-gray-50 p-4 rounded-full mb-4">
          <Clock size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">No scheduled emails</h3>
        <p className="text-sm mt-1">When you compose a campaign, scheduled emails will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
          <tr>
            <th scope="col" className="px-6 py-4 font-semibold">Recipient</th>
            <th scope="col" className="px-6 py-4 font-semibold">Subject</th>
            <th scope="col" className="px-6 py-4 font-semibold">Scheduled Time</th>
            <th scope="col" className="px-6 py-4 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => (
            <tr key={email.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                <Mail size={16} className="text-gray-400" />
                {email.recipient}
              </td>
              <td className="px-6 py-4 text-gray-600">{email.campaign.subject}</td>
              <td className="px-6 py-4 text-gray-600">
                {format(new Date(email.scheduledAt), "MMM d, yyyy h:mm a")}
              </td>
              <td className="px-6 py-4">
                <span className="px-2.5 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                  {email.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
