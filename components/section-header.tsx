import type { Icon } from "@phosphor-icons/react";

type SectionHeaderProps = {
  number: string;
  title: string;
  IconComponent: Icon;
};

export default function SectionHeader({ number, title, IconComponent }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <span className="section-num">{number}</span>
      <span className="section-icon" aria-hidden="true">
        <IconComponent size={22} weight="duotone" />
      </span>
      <h2 className="section-title">{title}</h2>
      <div className="section-line" />
    </div>
  );
}
