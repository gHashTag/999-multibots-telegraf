import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { myProfileAtom, updateProfileAtom } from '@/atoms';
import type { SocialLink } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';

interface ProfileEditProps {
  isOpen: boolean;
  onClose: () => void;
}

const PLATFORMS: SocialLink['platform'][] = [
  'telegram',
  'instagram',
  'twitter',
  'youtube',
  'tiktok',
  'website',
];

export function ProfileEdit({ isOpen, onClose }: ProfileEditProps) {
  const { t } = useLanguage();
  const profile = useAtomValue(myProfileAtom);
  const updateProfile = useSetAtom(updateProfileAtom);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      setSocialLinks(profile.social_links || []);
      setIsPublic(profile.is_public);
    }
  }, [profile]);

  if (!isOpen || !profile) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateProfile({
        display_name: displayName || null,
        bio: bio || null,
        is_public: isPublic,
        social_links: JSON.stringify(socialLinks.filter((l) => l.url)),
      });
      if (result) {
        onClose();
      } else {
        setError(t('profile.save_error'));
      }
    } catch (err) {
      console.error('Profile update error:', err);
      setError(t('profile.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const addSocialLink = () => {
    setSocialLinks([...socialLinks, { platform: 'telegram', url: '' }]);
  };

  const updateSocialLink = (index: number, field: keyof SocialLink, value: string) => {
    const updated = [...socialLinks];
    if (field === 'platform') {
      updated[index] = { ...updated[index], platform: value as SocialLink['platform'] };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSocialLinks(updated);
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  return (
    <div className="profile-edit-overlay" onClick={onClose}>
      <div className="profile-edit" onClick={(e) => e.stopPropagation()}>
        <div className="profile-edit__header">
          <h2>{t('profile.edit_profile')}</h2>
          <button className="profile-edit__close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="profile-edit__content">
          <div className="profile-edit__field">
            <label>{t('profile.display_name')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.display_name_placeholder')}
              maxLength={100}
            />
          </div>

          <div className="profile-edit__field">
            <label>{t('profile.bio')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('profile.bio_placeholder')}
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="profile-edit__field">
            <label>{t('profile.social_links')}</label>
            <div className="profile-edit__social-links">
              {socialLinks.map((link, index) => (
                <div key={index} className="profile-edit__social-link">
                  <select
                    value={link.platform}
                    onChange={(e) => updateSocialLink(index, 'platform', e.target.value)}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => updateSocialLink(index, 'url', e.target.value)}
                    placeholder="https://..."
                  />
                  <button
                    className="profile-edit__remove-link"
                    onClick={() => removeSocialLink(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button className="profile-edit__add-link" onClick={addSocialLink}>
                <Plus size={16} />
                <span>{t('profile.add_link')}</span>
              </button>
            </div>
          </div>

          <div className="profile-edit__field profile-edit__field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span>{t('profile.public_profile')}</span>
            </label>
            <p className="profile-edit__hint">{t('profile.public_profile_hint')}</p>
          </div>
        </div>

        {error && (
          <div className="profile-edit__error">
            {error}
          </div>
        )}

        <div className="profile-edit__footer">
          <button className="profile-edit__cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="profile-edit__save"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={18} />
            <span>{isSaving ? t('common.saving') : t('common.save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
