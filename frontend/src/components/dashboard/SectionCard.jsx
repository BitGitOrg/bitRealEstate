export const SectionCard = ({ title, subtitle, action, children, className = "", testId }) => (
  <section
    data-testid={testId}
    className={`bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-6 card-hover ${className}`}
  >
    {(title || action) && (
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          {title && <h3 className="font-display text-base font-semibold text-[#0F172A] tracking-tight">{title}</h3>}
          {subtitle && <p className="text-xs text-[#475569] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);
