import { useState } from 'react';
import { useRolePreview } from '../contexts/RolePreviewContext';
import { useRoles } from '../contexts/PermissionsContext';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';
import { DEVELOPER_ROLE_ID } from '../config/permissions';
import { FaTimes } from 'react-icons/fa';

export function RolePreviewBanner() {
  const { enabled, previewRoleId, startPreview, stopPreview } = useRolePreview();
  const { roles } = useRoles();
  const { actualRoleIds } = useEffectiveRoleIds();
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  if (!enabled || !previewRoleId) return null;

  const previewRole = roles.find((r) => r.id === previewRoleId);

  // Compute allowed preview roles (same logic as Settings page)
  const actualPositions = actualRoleIds.map((id) => {
    if (id === DEVELOPER_ROLE_ID) return 0;
    const role = roles.find((r) => r.id === id);
    return typeof role?.position === 'number' ? role.position : Infinity;
  });
  const myTopPosition = Math.min(...actualPositions);

  const allowedPreviewRoles = roles.filter((role) => {
    const rolePosition = role.id === DEVELOPER_ROLE_ID ? 0 : role.position;
    return rolePosition >= myTopPosition;
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: '#3b82f6',
        color: 'white',
        padding: '0.75rem 1.5rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 auto' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
            Role Preview Active
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
            Viewing as: {previewRole?.name || previewRoleId}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              fontSize: '0.85rem',
              cursor: 'pointer',
              minWidth: '150px',
            }}
          >
            <option value="" style={{ color: '#374151' }}>
              Switch role...
            </option>
            {allowedPreviewRoles.map((role) => (
              <option key={role.id} value={role.id} style={{ color: '#374151' }}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (selectedRoleId) {
                startPreview(selectedRoleId);
                setSelectedRoleId('');
              }
            }}
            disabled={!selectedRoleId}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '0.375rem',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backgroundColor: selectedRoleId ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: selectedRoleId ? 'pointer' : 'not-allowed',
              opacity: selectedRoleId ? 1 : 0.6,
            }}
          >
            Switch
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => stopPreview()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 1rem',
          borderRadius: '0.375rem',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          backgroundColor: 'rgba(220, 38, 38, 0.9)',
          color: 'white',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <FaTimes /> Exit Preview
      </button>
    </div>
  );
}
