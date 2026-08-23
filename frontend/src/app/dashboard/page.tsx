"use client";

import { useState } from "react";
import ScheduledEmailsTable from "@/components/ScheduledEmailsTable";
import SentEmailsTable from "@/components/SentEmailsTable";
import ComposeEmailModal from "@/components/ComposeEmailModal";
import { Plus } from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"scheduled" | "sent">("scheduled");
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white-900">Email Campaigns</h1>
        <button
          onClick={() => setIsComposeOpen(true)}
          className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all duration-150 cursor-pointer focus-visible:ring-4 focus-visible:ring-blue-200 outline-none font-medium shadow-sm"
        >
          <Plus size={20} />
          Compose New Email
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px px-4 gap-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("scheduled")}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === "scheduled"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
            >
              Scheduled Emails
            </button>
            <button
              onClick={() => setActiveTab("sent")}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === "sent"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
            >
              Sent Emails
            </button>
          </nav>
        </div>

        <div className="p-4 sm:p-6 min-h-[400px]">
          {activeTab === "scheduled" ? <ScheduledEmailsTable /> : <SentEmailsTable />}
        </div>
      </div>

      <ComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
      />
    </div>
  );
}
