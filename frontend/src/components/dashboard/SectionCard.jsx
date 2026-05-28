export const SectionCard = ({ title, subtitle, action, children, className = "", testId }) => (
  <section
    data-testid={testId}
    className={`bg-[#11171F] border border-[#212B36] rounded-xl p-6 card-hover ${className}`}
  >
    {(title || action) && (
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          {title && <h3 className="font-display text-base font-semibold text-[#F3F4F6] tracking-tight">{title}</h3>}
          {subtitle && <p className="text-xs text-[#9CA3AF] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);
