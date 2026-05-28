import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export const Layout = ({ children, title, subtitle, actions }) => {
  return (
    <div className="flex min-h-screen bg-[#080C11]">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} subtitle={subtitle} actions={actions} />
        <div className="flex-1 px-6 py-6 fade-up">{children}</div>
      </main>
    </div>
  );
};
