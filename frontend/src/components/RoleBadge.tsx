// Component to display a role as a colored badge
import type { Role } from '../config/permissions';

interface RoleBadgeProps {
  role: Role;
  size?: 'sm' | 'md';
}

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const padding = size === 'sm' ? '0.15rem 0.5rem' : '0.25rem 0.75rem';
  const fontSize = size === 'sm' ? '0.7rem' : '0.75rem';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding,
        borderRadius: '9999px',
        backgroundColor: `${role.color}20`, // 20% opacity background
        color: role.color,
        fontSize,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        border: `1px solid ${role.color}40`, // 40% opacity border
      }}
    >
      <span
        style={{
          width: size === 'sm' ? '6px' : '8px',
          height: size === 'sm' ? '6px' : '8px',
          borderRadius: '50%',
          backgroundColor: role.color,
          marginRight: '0.35rem',
        }}
      />
      {role.name}
    </span>
  );
}

interface RoleBadgesProps {
  roles: Role[];
  size?: 'sm' | 'md';
  maxDisplay?: number;
}

export function RoleBadges({ roles, size = 'md', maxDisplay = 3 }: RoleBadgesProps) {
  const displayRoles = roles.slice(0, maxDisplay);
  const remaining = roles.length - maxDisplay;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
      {displayRoles.map((role) => (
        <RoleBadge key={role.id} role={role} size={size} />
      ))}
      {remaining > 0 && (
        <span
          style={{
            fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
            color: '#6b7280',
            fontWeight: 500,
          }}
        >
          +{remaining} more
        </span>
      )}
    </div>
  );
}
