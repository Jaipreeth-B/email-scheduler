"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import Image from "next/image";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return null; // Redirect handles it
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-semibold text-lg text-gray-900">ReachInbox</div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-gray-900">{session.user?.name}</div>
                <div className="text-xs text-gray-500">{session.user?.email}</div>
              </div>
              {session.user?.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User avatar"}
                  width={36}
                  height={36}
                  className="rounded-full bg-gray-100"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  <UserIcon size={18} />
                </div>
              )}
            </div>
            
            <div className="h-6 w-px bg-gray-200"></div>
            
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-gray-500 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
