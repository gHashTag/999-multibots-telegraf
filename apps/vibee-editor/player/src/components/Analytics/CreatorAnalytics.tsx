// ===============================
// Creator Analytics Dashboard
// ===============================

import { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Eye, Heart, MessageCircle,
  Share2, Users, Video, Clock, Calendar,
  ChevronDown, ArrowUpRight, BarChart3
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './CreatorAnalytics.css';

interface AnalyticsData {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  followers: number;
  followersChange: number;
  videosCount: number;
  avgWatchTime: number;
  viewsHistory: { date: string; views: number }[];
  topVideos: {
    id: number;
    title: string;
    thumbnail: string;
    views: number;
    likes: number;
    engagement: number;
  }[];
  audienceData: {
    ageGroups: { label: string; percentage: number }[];
    countries: { name: string; percentage: number }[];
    peakHours: { hour: number; activity: number }[];
  };
}

// Mock data generator
function generateMockData(): AnalyticsData {
  const viewsHistory = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en', { weekday: 'short' }),
    views: Math.floor(Math.random() * 5000) + 1000,
  }));

  return {
    totalViews: 125400,
    totalLikes: 8920,
    totalComments: 1243,
    totalShares: 567,
    followers: 4521,
    followersChange: 12.5,
    videosCount: 28,
    avgWatchTime: 45,
    viewsHistory,
    topVideos: [
      { id: 1, title: 'How to edit like a pro', thumbnail: '/api/placeholder/120/68', views: 15200, likes: 1200, engagement: 8.2 },
      { id: 2, title: 'Best AI tools 2024', thumbnail: '/api/placeholder/120/68', views: 12800, likes: 980, engagement: 7.8 },
      { id: 3, title: 'Creative transitions', thumbnail: '/api/placeholder/120/68', views: 9500, likes: 720, engagement: 7.5 },
    ],
    audienceData: {
      ageGroups: [
        { label: '18-24', percentage: 35 },
        { label: '25-34', percentage: 40 },
        { label: '35-44', percentage: 18 },
        { label: '45+', percentage: 7 },
      ],
      countries: [
        { name: 'Russia', percentage: 42 },
        { name: 'USA', percentage: 28 },
        { name: 'Germany', percentage: 12 },
        { name: 'Other', percentage: 18 },
      ],
      peakHours: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        activity: Math.floor(Math.random() * 100),
      })),
    },
  };
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

interface CreatorAnalyticsProps {
  userId?: number;
}

export function CreatorAnalytics({ userId }: CreatorAnalyticsProps) {
  const { t } = useLanguage();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'audience'>('overview');

  // In real app, fetch from API
  const data = useMemo(() => generateMockData(), []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const maxViews = Math.max(...data.viewsHistory.map(d => d.views));

  return (
    <div className="analytics">
      {/* Header */}
      <div className="analytics-header">
        <h1 className="analytics-title">
          <BarChart3 size={24} />
          {t('analytics.title')}
        </h1>
        <div className="analytics-timerange">
          <select
            value={timeRange}
            onChange={e => setTimeRange(e.target.value as TimeRange)}
          >
            <option value="7d">{t('analytics.last7days')}</option>
            <option value="30d">{t('analytics.last30days')}</option>
            <option value="90d">{t('analytics.last90days')}</option>
            <option value="all">{t('analytics.allTime')}</option>
          </select>
          <ChevronDown size={16} />
        </div>
      </div>

      {/* Tabs */}
      <div className="analytics-tabs">
        <button
          className={`analytics-tab ${activeTab === 'overview' ? 'analytics-tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          {t('analytics.overview')}
        </button>
        <button
          className={`analytics-tab ${activeTab === 'content' ? 'analytics-tab--active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          {t('analytics.content')}
        </button>
        <button
          className={`analytics-tab ${activeTab === 'audience' ? 'analytics-tab--active' : ''}`}
          onClick={() => setActiveTab('audience')}
        >
          {t('analytics.audience')}
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="analytics-overview">
          {/* Stats Grid */}
          <div className="analytics-stats">
            <div className="analytics-stat">
              <div className="analytics-stat__icon analytics-stat__icon--views">
                <Eye size={20} />
              </div>
              <div className="analytics-stat__content">
                <span className="analytics-stat__value">{formatNumber(data.totalViews)}</span>
                <span className="analytics-stat__label">{t('analytics.views')}</span>
              </div>
            </div>

            <div className="analytics-stat">
              <div className="analytics-stat__icon analytics-stat__icon--likes">
                <Heart size={20} />
              </div>
              <div className="analytics-stat__content">
                <span className="analytics-stat__value">{formatNumber(data.totalLikes)}</span>
                <span className="analytics-stat__label">{t('analytics.likes')}</span>
              </div>
            </div>

            <div className="analytics-stat">
              <div className="analytics-stat__icon analytics-stat__icon--comments">
                <MessageCircle size={20} />
              </div>
              <div className="analytics-stat__content">
                <span className="analytics-stat__value">{formatNumber(data.totalComments)}</span>
                <span className="analytics-stat__label">{t('analytics.comments')}</span>
              </div>
            </div>

            <div className="analytics-stat">
              <div className="analytics-stat__icon analytics-stat__icon--followers">
                <Users size={20} />
              </div>
              <div className="analytics-stat__content">
                <span className="analytics-stat__value">{formatNumber(data.followers)}</span>
                <span className="analytics-stat__label">{t('analytics.followers')}</span>
                <span className={`analytics-stat__change ${data.followersChange >= 0 ? 'positive' : 'negative'}`}>
                  {data.followersChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(data.followersChange)}%
                </span>
              </div>
            </div>
          </div>

          {/* Views Chart */}
          <div className="analytics-chart">
            <h3 className="analytics-chart__title">{t('analytics.viewsOverTime')}</h3>
            <div className="analytics-chart__bars">
              {data.viewsHistory.map((day, i) => (
                <div key={i} className="analytics-chart__bar-group">
                  <div
                    className="analytics-chart__bar"
                    style={{ height: `${(day.views / maxViews) * 100}%` }}
                  >
                    <span className="analytics-chart__bar-value">{formatNumber(day.views)}</span>
                  </div>
                  <span className="analytics-chart__bar-label">{day.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="analytics-quick-stats">
            <div className="analytics-quick-stat">
              <Video size={18} />
              <span>{data.videosCount} {t('analytics.videos')}</span>
            </div>
            <div className="analytics-quick-stat">
              <Clock size={18} />
              <span>{data.avgWatchTime}s {t('analytics.avgWatch')}</span>
            </div>
            <div className="analytics-quick-stat">
              <Share2 size={18} />
              <span>{formatNumber(data.totalShares)} {t('analytics.shares')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="analytics-content">
          <h3 className="analytics-section-title">{t('analytics.topVideos')}</h3>
          <div className="analytics-videos">
            {data.topVideos.map((video, i) => (
              <div key={video.id} className="analytics-video">
                <span className="analytics-video__rank">#{i + 1}</span>
                <div className="analytics-video__thumb">
                  <div className="analytics-video__thumb-placeholder" />
                </div>
                <div className="analytics-video__info">
                  <span className="analytics-video__title">{video.title}</span>
                  <div className="analytics-video__stats">
                    <span><Eye size={12} /> {formatNumber(video.views)}</span>
                    <span><Heart size={12} /> {formatNumber(video.likes)}</span>
                    <span className="analytics-video__engagement">
                      <ArrowUpRight size={12} /> {video.engagement}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audience Tab */}
      {activeTab === 'audience' && (
        <div className="analytics-audience">
          {/* Age Distribution */}
          <div className="analytics-section">
            <h3 className="analytics-section-title">{t('analytics.ageDistribution')}</h3>
            <div className="analytics-bars-horizontal">
              {data.audienceData.ageGroups.map((group) => (
                <div key={group.label} className="analytics-bar-h">
                  <span className="analytics-bar-h__label">{group.label}</span>
                  <div className="analytics-bar-h__track">
                    <div
                      className="analytics-bar-h__fill"
                      style={{ width: `${group.percentage}%` }}
                    />
                  </div>
                  <span className="analytics-bar-h__value">{group.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Countries */}
          <div className="analytics-section">
            <h3 className="analytics-section-title">{t('analytics.topCountries')}</h3>
            <div className="analytics-countries">
              {data.audienceData.countries.map((country) => (
                <div key={country.name} className="analytics-country">
                  <span className="analytics-country__name">{country.name}</span>
                  <div className="analytics-country__bar">
                    <div
                      className="analytics-country__fill"
                      style={{ width: `${country.percentage}%` }}
                    />
                  </div>
                  <span className="analytics-country__value">{country.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
