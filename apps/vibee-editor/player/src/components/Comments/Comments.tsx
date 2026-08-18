import { useState, useCallback, useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { userAtom } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { Send, Heart, MoreHorizontal, Trash2, X } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/dateUtils';
import './Comments.css';

export interface Comment {
  id: string;
  userId: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  text: string;
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
  replies?: Comment[];
}

interface CommentsProps {
  templateId: string;
  comments: Comment[];
  onAddComment: (text: string, replyToId?: string) => Promise<void>;
  onLikeComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onClose?: () => void;
  isLoading?: boolean;
}

export function Comments({
  templateId,
  comments,
  onAddComment,
  onLikeComment,
  onDeleteComment,
  onClose,
  isLoading = false,
}: CommentsProps) {
  const { t } = useLanguage();
  const user = useAtomValue(userAtom);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddComment(newComment.trim(), replyTo?.id);
      setNewComment('');
      setReplyTo(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [newComment, replyTo, isSubmitting, onAddComment]);

  const handleReply = useCallback((comment: Comment) => {
    setReplyTo(comment);
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  return (
    <div className="comments">
      <div className="comments__header">
        <h3 className="comments__title">
          {t('comments.title')} ({comments.length})
        </h3>
        {onClose && (
          <button className="comments__close" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>

      <div className="comments__list">
        {isLoading ? (
          <div className="comments__loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="comment comment--skeleton">
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div className="comment__content">
                  <div className="skeleton" style={{ width: '40%', height: 14 }} />
                  <div className="skeleton" style={{ width: '80%', height: 16, marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="comments__empty">
            <p>{t('comments.empty')}</p>
            <span>{t('comments.be_first')}</span>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              onLike={() => onLikeComment(comment.id)}
              onReply={() => handleReply(comment)}
              onDelete={() => onDeleteComment(comment.id)}
            />
          ))
        )}
      </div>

      {user && (
        <form className="comments__form" onSubmit={handleSubmit}>
          {replyTo && (
            <div className="comments__reply-indicator">
              <span>{t('comments.replying_to')} @{replyTo.username}</span>
              <button type="button" onClick={cancelReply}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="comments__input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="comments__input"
              placeholder={t('comments.placeholder')}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="comments__submit"
              disabled={!newComment.trim() || isSubmitting}
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

interface CommentItemProps {
  comment: Comment;
  currentUserId?: number;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
}

function CommentItem({ comment, currentUserId, onLike, onReply, onDelete }: CommentItemProps) {
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);
  const isOwner = currentUserId === comment.userId;

  return (
    <div className="comment">
      <div className="comment__avatar">
        {comment.avatarUrl ? (
          <img src={comment.avatarUrl} alt={comment.username} />
        ) : (
          <div className="comment__avatar-placeholder">
            {(comment.displayName || comment.username)[0].toUpperCase()}
          </div>
        )}
      </div>

      <div className="comment__content">
        <div className="comment__header">
          <span className="comment__username">
            {comment.displayName || comment.username}
          </span>
          <span className="comment__time">
            {formatDistanceToNow(comment.createdAt)}
          </span>
        </div>

        <p className="comment__text">{comment.text}</p>

        <div className="comment__actions">
          <button
            className={`comment__action ${comment.isLiked ? 'liked' : ''}`}
            onClick={onLike}
          >
            <Heart size={14} fill={comment.isLiked ? 'currentColor' : 'none'} />
            <span>{comment.likesCount || ''}</span>
          </button>

          <button className="comment__action" onClick={onReply}>
            {t('comments.reply')}
          </button>

          {isOwner && (
            <div className="comment__menu-wrapper">
              <button
                className="comment__action"
                onClick={() => setShowMenu(!showMenu)}
              >
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className="comment__menu">
                  <button onClick={onDelete}>
                    <Trash2 size={14} />
                    {t('comments.delete')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
