'use client';

import ThemeSwitcher from './ThemeSwitcher';

export default function SectionHero({ icon: Icon, title, tag, subtitle, children }) {
  return (
    <div className="omx-hero">
      <div className="flex items-center gap-3">
        <div className="omx-logo">{Icon ? <Icon className="h-5 w-5" /> : null}</div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="omx-title">{title}</h1>
            {tag ? <span className="omx-tag">{tag}</span> : null}
          </div>
          {subtitle ? <p className="omx-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ThemeSwitcher />
        {children}
      </div>
    </div>
  );
}
