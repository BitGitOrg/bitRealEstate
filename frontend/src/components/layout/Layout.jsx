import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";
import { HelpButton } from "../HelpButton";
import { OnboardingTour } from "../OnboardingTour";
import { PWAInstallPrompt } from "../PWAInstallPrompt";
import { SidebarProvider } from "../../lib/sidebarContext";

export const Layout = ({ children, title, subtitle, actions }) => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[#F8FAFC]">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <Topbar title={title} subtitle={subtitle} actions={actions} />
          {/* pb extra su mobile per non sovrapporsi alla bottom nav (56px + safe area) */}
          <div className="flex-1 px-3 sm:px-4 lg:px-6 py-4 lg:py-6 pb-24 lg:pb-6 fade-up">
            {children}
          </div>
        </main>
        <BottomNav />
        <PWAInstallPrompt />
        <HelpButton />
        <OnboardingTour />
      </div>
    </SidebarProvider>
  );
};
