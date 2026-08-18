// PublishModal - Share template to community feed
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetAtom, useAtomValue } from 'jotai';
import { publishToFeedAtom, currentRemixSourceAtom } from '@/atoms';
import { templatesAtom, selectedTemplateIdAtom } from '@/atoms/templates';
import { userAtom, instagramStatusAtom, fetchInstagramStatusAtom, connectInstagramAtom } from '@/atoms/user';
import { useLanguage } from '@/hooks/useLanguage';
import { X, Globe, Loader2, Sparkles, Check, Send, Edit3, Instagram, Link2 } from 'lucide-react';
import { API_BASE } from '../../config';
import './PublishModal.css';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string;
  thumbnailUrl?: string;
}

// Generate default Telegram caption
function generateDefaultCaption(name: string, description: string, creatorName: string): string {
  const desc = description?.trim() ? `\n\n${description}` : '';
  return `🎬 ${name}${desc}\n\n👤 ${creatorName}\n🔗 vibee-player.fly.dev/feed\n\n#vibee #reels #ai`;
}

export function PublishModal({ isOpen, onClose, videoUrl, thumbnailUrl }: PublishModalProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Debug: Log what we received
  useEffect(() => {
    if (isOpen) {
      console.log('[PublishModal] Opened with:', { videoUrl, thumbnailUrl });
    }
  }, [isOpen, videoUrl, thumbnailUrl]);
  const publishToFeed = useSetAtom(publishToFeedAtom);
  const templates = useAtomValue(templatesAtom);
  const selectedTemplateId = useAtomValue(selectedTemplateIdAtom);
  const remixSource = useAtomValue(currentRemixSourceAtom);
  const user = useAtomValue(userAtom);

  // Instagram connection
  const instagramStatus = useAtomValue(instagramStatusAtom);
  const fetchInstagramStatus = useSetAtom(fetchInstagramStatusAtom);
  const connectInstagram = useSetAtom(connectInstagramAtom);
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [postToTelegram, setPostToTelegram] = useState(true);
  const [postToInstagram, setPostToInstagram] = useState(false); // Default to false until connected
  const [caption, setCaption] = useState('');
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Instagram status when modal opens
  useEffect(() => {
    if (isOpen && user) {
      fetchInstagramStatus();
    }
  }, [isOpen, user, fetchInstagramStatus]);

  // Auto-enable Instagram posting if connected
  useEffect(() => {
    if (instagramStatus?.connected) {
      setPostToInstagram(true);
    }
  }, [instagramStatus?.connected]);

  // Handle Instagram connect
  const handleConnectInstagram = useCallback(async () => {
    setIsConnectingInstagram(true);
    try {
      await connectInstagram();
      // After OAuth completes, user will be redirected back
      // We'll poll for status updates
      const pollStatus = setInterval(async () => {
        await fetchInstagramStatus();
      }, 2000);
      // Stop polling after 60 seconds
      setTimeout(() => clearInterval(pollStatus), 60000);
    } finally {
      setIsConnectingInstagram(false);
    }
  }, [connectInstagram, fetchInstagramStatus]);

  // Get current template name as default
  const currentTemplate = templates.find(t => t.id === selectedTemplateId);
  const creatorName = user?.first_name || user?.username || 'Creator';

  // Auto-generate caption when name/description changes
  const defaultCaption = useMemo(() => {
    return generateDefaultCaption(name || 'My Reel', description, creatorName);
  }, [name, description, creatorName]);

  // Initialize caption with default when first enabling any platform
  useEffect(() => {
    if ((postToTelegram || postToInstagram) && !caption) {
      setCaption(defaultCaption);
    }
  }, [postToTelegram, postToInstagram, defaultCaption, caption]);

  // Update caption when name/description changes (if not manually edited)
  useEffect(() => {
    if (!isEditingCaption && (postToTelegram || postToInstagram)) {
      setCaption(defaultCaption);
    }
  }, [defaultCaption, isEditingCaption, postToTelegram, postToInstagram]);

  // Generate caption with AI
  const handleGenerateAI = useCallback(async () => {
    setIsGeneratingAI(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai/generate-caption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'My Reel',
          description: description || '',
          creator_name: creatorName,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setCaption(data.caption);
        setIsEditingCaption(true); // Mark as manually edited
      }
    } catch (err) {
      console.error('Failed to generate AI caption:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  }, [name, description, creatorName]);

  const handlePublish = useCallback(async () => {
    if (!videoUrl) {
      setError(t('publish.noVideo'));
      return;
    }

    if (!name.trim()) {
      setError(t('publish.nameRequired'));
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      await publishToFeed({
        name: name.trim(),
        description: description.trim() || undefined,
        videoUrl,
        thumbnailUrl,
        postToTelegram,
        postToInstagram,
        telegramCaption: (postToTelegram || postToInstagram) ? caption : undefined,
      });

      setIsPublished(true);

      // Auto-switch to feed after 1.5s
      setTimeout(() => {
        navigate('/feed');
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('publish.failed'));
    } finally {
      setIsPublishing(false);
    }
  }, [name, description, videoUrl, thumbnailUrl, postToTelegram, postToInstagram, caption, publishToFeed, navigate, onClose, t]);

  if (!isOpen) return null;

  return (
    <div className="publish-modal-overlay" onClick={onClose}>
      <div className="publish-modal" onClick={e => e.stopPropagation()}>
        <button className="publish-modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        {isPublished ? (
          <div className="publish-success">
            <div className="publish-success-icon">
              <Check size={48} />
            </div>
            <h2>{t('publish.success')}</h2>
            <p>{t('publish.successDesc')}</p>
          </div>
        ) : (
          <>
            <div className="publish-modal-header">
              <Globe size={24} />
              <h2>{t('publish.title')}</h2>
            </div>

            <p className="publish-modal-subtitle">{t('publish.subtitle')}</p>

            {remixSource && (
              <div className="publish-remix-badge">
                <Sparkles size={14} />
                <span>{t('publish.remixOf')} {remixSource.creatorName}</span>
              </div>
            )}

            <div className="publish-preview">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="Preview"
                  onError={() => console.error('[PublishModal] Thumbnail load error:', thumbnailUrl)}
                />
              ) : videoUrl ? (
                <video
                  src={videoUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  onError={(e) => console.error('[PublishModal] Video load error:', videoUrl, e)}
                  onLoadedData={() => console.log('[PublishModal] Video loaded:', videoUrl)}
                />
              ) : (
                <div className="publish-preview-placeholder">
                  <Globe size={32} />
                  <span style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>
                    No video - render first
                  </span>
                </div>
              )}
            </div>

            <div className="publish-form">
              <div className="publish-field">
                <label>{t('publish.name')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={currentTemplate?.name || t('publish.namePlaceholder')}
                  maxLength={100}
                  autoFocus
                />
              </div>

              <div className="publish-field">
                <label>{t('publish.description')}</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('publish.descPlaceholder')}
                  maxLength={500}
                  rows={3}
                />
              </div>

              <div className="publish-social-section">
                <div className="publish-social-options">
                  <label className="publish-checkbox-label">
                    <input
                      type="checkbox"
                      checked={postToTelegram}
                      onChange={e => setPostToTelegram(e.target.checked)}
                    />
                    <Send size={16} />
                    <span>{t('publish.postToTelegram')}</span>
                  </label>

                  {instagramStatus?.connected ? (
                    <label className="publish-checkbox-label">
                      <input
                        type="checkbox"
                        checked={postToInstagram}
                        onChange={e => setPostToInstagram(e.target.checked)}
                      />
                      <Instagram size={16} />
                      <span>@{instagramStatus.instagram_username}</span>
                    </label>
                  ) : (
                    <button
                      type="button"
                      className="publish-connect-btn instagram"
                      onClick={handleConnectInstagram}
                      disabled={isConnectingInstagram}
                    >
                      {isConnectingInstagram ? (
                        <Loader2 size={16} className="spinning" />
                      ) : (
                        <Link2 size={16} />
                      )}
                      <Instagram size={16} />
                      <span>{t('publish.connectInstagram')}</span>
                    </button>
                  )}
                </div>

                {(postToTelegram || postToInstagram) && (
                  <div className="telegram-preview-section">
                    <div className="telegram-preview-header">
                      <span className="telegram-preview-label">{t('publish.captionPreview')}</span>
                      <div className="telegram-preview-actions">
                        <button
                          type="button"
                          className="telegram-ai-btn"
                          onClick={handleGenerateAI}
                          disabled={isGeneratingAI}
                        >
                          {isGeneratingAI ? (
                            <Loader2 size={14} className="spinning" />
                          ) : (
                            <Sparkles size={14} />
                          )}
                          <span>{t('publish.generateAI')}</span>
                        </button>
                        <button
                          type="button"
                          className="telegram-edit-btn"
                          onClick={() => setIsEditingCaption(!isEditingCaption)}
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </div>

                    {isEditingCaption ? (
                      <>
                        <textarea
                          className="telegram-caption-editor"
                          value={caption}
                          onChange={e => setCaption(e.target.value)}
                          rows={6}
                          maxLength={2200}
                          placeholder={t('publish.captionPlaceholder')}
                        />
                        <div className="caption-counter">
                          <span className={caption.length > 2000 ? 'warning' : ''}>
                            {caption.length}/2200
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="telegram-post-preview">
                        <div className="telegram-post-card">
                          <div className="telegram-post-video">
                            {thumbnailUrl ? (
                              <img src={thumbnailUrl} alt="" />
                            ) : (
                              <div className="telegram-post-video-placeholder" />
                            )}
                          </div>
                          <div className="telegram-post-caption">
                            {caption.split('\n').map((line, i) => (
                              <span key={i}>{line}<br /></span>
                            ))}
                          </div>
                        </div>
                        <p className="telegram-channel-badge">
                          {postToTelegram && '@vibee_reels'}
                          {postToTelegram && postToInstagram && ' · '}
                          {postToInstagram && '@agent_vibecoder'}
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      className="telegram-reset-btn"
                      onClick={() => {
                        setCaption(defaultCaption);
                        setIsEditingCaption(false);
                      }}
                    >
                      {t('publish.resetCaption')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="publish-error">{error}</div>
            )}

            <div className="publish-actions">
              <button className="publish-cancel" onClick={onClose}>
                {t('dialog.cancel')}
              </button>
              <button
                className="publish-submit"
                onClick={handlePublish}
                disabled={isPublishing || !name.trim()}
              >
                {isPublishing ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    {t('publish.publishing')}
                  </>
                ) : (
                  <>
                    <Globe size={16} />
                    {t('publish.share')}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
