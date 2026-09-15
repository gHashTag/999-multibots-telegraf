// ===============================
// Language Atoms - i18n with Jotai
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'
import { IS_EMBED, embedLang } from '@/lib/embed'

export type Language = 'ru' | 'en'

interface Translations {
  [key: string]: string
}

// ===============================
// Translations
// ===============================

const en: Translations = {
  // ── CRM ───────────────────────────────────────────────────────────────────
  'crm.title': 'CRM',
  'crm.refresh': 'Refresh',
  'crm.refreshing': 'Refreshing…',
  'crm.unreachable': 'Could not load',
  'crm.waiting.title': 'Waiting for an answer',
  'crm.waiting.none':
    'Nobody is waiting for an answer. That is good news, not an empty screen.',
  'crm.waiting.counts':
    'waiting on us: {ours} · time to return: {due} · awaiting reply: {theirs}',
  'crm.leads.title': 'Hot leads',
  'crm.leads.counts': 'found {found}',
  'crm.leads.setAside': 'set aside, touched recently: {n}',
  'crm.leads.quiet': 'quiet for {days} d',
  'crm.audience.title': 'Audience',
  'crm.audience.total': 'total',
  'crm.audience.paying': 'paying',
  'crm.audience.came7': 'last 7 days',
  'crm.audience.came30': 'last 30 days',
  'crm.act.written': 'Wrote',
  'crm.act.replied': 'Replied',
  'crm.act.refused': 'Refused',
  'crm.act.later': 'Asked for later',
  'crm.act.bought': 'Bought',
  'crm.act.note': 'Note',
  'crm.note':
    'These buttons record what already happened — they send nothing to anybody. Sending is confirmed one message at a time in the bot chat.',
  'crm.stage.client': 'client',
  'crm.stage.refused': 'refused',
  'crm.stage.later': 'asked for later',
  'crm.stage.talking': 'talking',
  'crm.stage.written': 'written to',
  'crm.stage.winback': 'win back',
  'crm.stage.new': 'new',
  'crm.wait.ours': 'waiting on US',
  'crm.wait.theirs': 'awaiting reply',
  'crm.wait.due': 'time to return',
  // ── CRM: client list and per-client workspace ────────────────────────────
  'crm.clients.title': 'Clients',
  'crm.clients.none': 'No clients with a profile or a conversation yet.',
  'crm.clients.profile': 'profile',
  'crm.clients.soul': 'SOUL',
  'crm.clients.duets': 'duets: {n}',
  'crm.clients.paid': 'paid',
  'crm.clients.paidUnknown': 'payments unavailable — stage from touches only',
  'crm.clients.filter.all': 'all',
  'crm.clients.filter.clients': 'clients',
  'crm.clients.filter.leads': 'leads',
  'crm.client.title': 'Client {id}',
  'crm.client.back': 'CRM',
  'crm.client.chatButton': 'Chat about this client',
  'crm.client.unreachable': 'unavailable',
  'crm.client.empty': 'nothing yet',
  'crm.client.profile.title': 'Profile / SOUL / skills',
  'crm.client.profile.profile': 'profile',
  'crm.client.profile.soul': 'SOUL',
  'crm.client.profile.skills': 'skills',
  'crm.client.profile.updated': 'updated',
  'crm.client.plan.title': 'Content plan',
  'crm.client.plan.progress': '{done} of {total} done',
  'crm.client.plan.goal': 'goal',
  'crm.client.duets.title': 'Duets',
  'crm.client.duets.none': 'no runs yet',
  'crm.client.duets.paid': 'paid calls',
  'crm.client.duets.media': 'media sent',
  'crm.client.duets.turns': 'turns',
  'crm.client.duets.violations': 'violations',
  'crm.client.duets.voice': 'voice flags',
  'crm.client.duets.coverage': 'coverage',
  'crm.client.duets.dry': 'dry run',
  'crm.client.duets.start': 'Start duet',
  'crm.client.duets.starting': 'Starting…',
  'crm.client.duets.confirm':
    'Dry run is off: the agent will send REAL Telegram messages to this client. Start anyway?',
  'crm.client.duets.confirmYes': 'Yes, send for real',
  'crm.client.duets.confirmNo': 'Cancel',
  'crm.client.duets.started': 'duet {id} started · {state}',
  'crm.client.duets.notStarted': 'not started',
  'crm.client.duets.error': 'could not start',
  'crm.client.duets.lines': 'lines',
  'crm.client.duets.state.done': 'done',
  'crm.client.duets.state.running': 'running',
  'crm.client.duets.state.failed': 'failed',
  'crm.client.duets.state.lost': 'lost',
  'crm.client.touches.title': 'Touches and stage',
  'crm.client.touches.stage': 'stage',
  'crm.client.touches.none': 'no touches recorded',
  'crm.client.media.title': 'Media',
  'crm.client.media.none': 'no files exchanged',
  'crm.client.media.ours': 'ours',
  'crm.client.media.theirs': 'theirs',
  'crm.client.messages.title': 'Last messages',
  'crm.client.messages.none': 'no messages yet',
  'crm.client.messages.waitingOnUs': 'waiting on us',
  'crm.client.messages.us': 'we',
  'crm.client.messages.them': 'client',
  'crm.client.chat.title': 'Conversation about client {id}',
  'crm.client.chat.back': 'To the client',
  'crm.client.chat.welcome':
    'This is the conversation about client {id}. I already hold their profile, plan and last messages — ask what to do next.',

  // ── Connecting a personal Telegram account ────────────────────────────────
  // The login is the front door of the product: a personal assistant and a CRM
  // that can do nothing at all until this screen succeeds. It is written to be
  // short and unfrightening -- one decision per screen -- while still saying
  // out loud what access is being handed over.
  'connect.title': 'Connect Telegram',
  'connect.lead':
    'The assistant works with your correspondence: it reads it, drafts replies, and sends only what you have confirmed.',
  'connect.can.read': 'Reads your dialogs, contacts and message history.',
  'connect.can.write': 'Writes to anybody only after you confirm the text.',
  'connect.can.secret':
    'The code and the two-factor password are not stored — they go straight to Telegram.',
  'connect.can.phone':
    'Your number is kept so you need not type it again; disconnecting deletes it.',
  'connect.can.off': 'You can disconnect here, in one tap.',
  'connect.step': 'Step {n} of {total}',
  'connect.back': 'Back',
  'connect.phone.title': 'Your phone number',
  'connect.phone.hint':
    'The same number your Telegram account is registered to.',
  'connect.phone.fromTelegram': 'Taken from Telegram — you can correct it',
  'connect.phone.go': 'Get the code',
  'connect.phone.going': 'Sending the code…',
  'connect.code.title': 'Enter the code',
  'connect.code.viaApp':
    'Telegram sent the code as a message — look for the "Telegram" chat',
  'connect.code.viaSms': 'The code was sent to you by SMS',
  'connect.code.to': 'to {phone}',
  'connect.code.change': 'Change the number',
  'connect.code.label': 'Code from Telegram',
  'connect.code.warn': 'Do not forward this code to anybody, us included.',
  'connect.code.go': 'Confirm',
  'connect.code.going': 'Checking…',
  'connect.code.resend': 'Request a new code',
  'connect.code.resendIn': 'A new code can be requested in {sec} s',
  'connect.pass.title': 'Two-factor password',
  'connect.pass.hint':
    'Your account has two-factor protection switched on. The password is not stored.',
  'connect.pass.label': 'Password',
  'connect.pass.go': 'Sign in',
  'connect.pass.going': 'Checking…',
  'connect.done.title': 'Telegram connected',
  'connect.done.body':
    'The assistant sees your dialogs and contacts and can search your correspondence. It sends nothing in your name without your confirmation.',
  'connect.done.off': 'Disconnect',

  // Header
  'nav.features': 'Features',
  'nav.pricing': 'Pricing',
  'nav.docs': 'Docs',
  'nav.getStarted': 'Get Started',

  // Hero
  'hero.badge': 'Agentic vibe-reels',
  'hero.title': 'Your agent makes the reels',
  'hero.subtitle':
    'Connect any agent over MCP — it reads your feed, your files and templates, and publishes reels for you. Or just chat with the built-in one. You describe the vibe; the agent does the work.',
  'cta.try': 'Try Free',
  'cta.demo': 'Watch Demo',
  'cta.createReel': 'Create your first reel',
  'hero.stat.creators': 'Creators',
  'hero.stat.reels': 'Reels created',
  'hero.stat.minUnit': 'min',
  'hero.stat.avgTime': 'Avg. creation time',
  'hero.stat.views': 'Total views',
  'hero.video.createdWith': 'Created with VIBEE',
  'hero.trust.label': 'Share on your favorite platforms',

  // Feed Preview
  'feedPreview.badge': 'Community',
  'feedPreview.title': 'Explore the creator feed',
  'feedPreview.subtitle':
    'Watch, like, and get inspired by the best reels from our community',
  'feedPreview.cta': 'View Feed',

  // Features
  'features.badge': 'Platform',
  'features.title': 'Everything for creating reels',
  'features.subtitle': 'From idea to viral video in a few clicks',
  'features.reels.title': 'AI Reels Creator',
  'features.reels.desc':
    'Describe an idea — get a script, video, and voiceover in 2 minutes',
  'features.feed.title': 'Creator Feed',
  'features.feed.desc':
    'Watch, like, and get inspired by the best community reels',
  'features.avatars.title': 'Talking Avatars',
  'features.avatars.desc':
    'Create your digital twin that speaks with your voice',
  'features.analytics.title': 'Analytics',
  'features.analytics.desc': 'Track reach, engagement, and audience growth',

  // Creator Showcase
  'creatorShowcase.badge': 'Creators',
  'creatorShowcase.title': 'Join top creators',
  'creatorShowcase.subtitle':
    'Thousands of creators are already making money with VIBEE',
  'creatorShowcase.followers': 'Followers',
  'creatorShowcase.reels': 'Reels',
  'creatorShowcase.quote1':
    'VIBEE changed my content game. I create 5 reels a day now!',
  'creatorShowcase.quote2':
    'The AI avatars are mind-blowing. My audience loves them.',
  'creatorShowcase.quote3':
    'Finally a tool that makes professional video accessible to everyone.',

  // Testimonials
  'testimonials.badge': 'Reviews',
  'testimonials.title': 'What our users say',
  'testimonials.subtitle': 'Real reviews from real creators',
  'testimonials.role1': 'Content Creator',
  'testimonials.role2': 'Marketing Manager',
  'testimonials.role3': 'Blogger',
  'testimonials.role4': 'SMM Specialist',
  'testimonials.quote1':
    'I used to spend hours editing. Now I create a reel in 2 minutes. This is a game changer!',
  'testimonials.quote2':
    "Our team's productivity tripled. VIBEE saves us tons of time and budget.",
  'testimonials.quote3':
    "The AI avatars look so realistic! My subscribers can't tell the difference.",
  'testimonials.quote4':
    'Simple interface, powerful result. Recommend to anyone who creates content.',

  // Integrations
  'integrations.title': 'Powered by Leading AI',
  'integrations.subtitle':
    'Integrate with the best AI services in one platform',

  // How it Works
  'howItWorks.badge': 'Simple',
  'howItWorks.title': 'How It Works',
  'howItWorks.subtitle': 'From idea to ready reel in 3 easy steps',
  'howItWorks.step1.title': 'Describe your idea',
  'howItWorks.step1.desc':
    'Tell us what you want to create. AI will write the script.',
  'howItWorks.step2.title': 'Choose the style',
  'howItWorks.step2.desc':
    'Select avatar, voice, music, and visual style for your reel.',
  'howItWorks.step3.title': 'Publish',
  'howItWorks.step3.desc':
    'Share to Instagram, TikTok, YouTube, or the VIBEE feed.',

  // Pricing
  'pricing.badge': 'Pricing',
  'pricing.title': 'Pay for what you make',
  'pricing.subtitle':
    'No plans and no subscription: you top up a balance in tokens and spend it',
  'pricing.pro.popular': 'Popular',
  'pricing.pack.name': '{n} tokens',
  'pricing.pack.period': 'Telegram Stars',
  'pricing.pack.cta': 'Top up',
  'pricing.tokens.feature1': 'Pictures, voice-over, video, reel assembly',
  'pricing.tokens.feature2': 'One balance for everything, no seats',
  'pricing.tokens.feature3':
    'The price of each action is shown before you press',
  'pricing.tokens.feature4': 'Tokens do not expire and are not billed monthly',
  'pricing.tokens.note':
    'First tokens on sign-up, no card. An invoice for any amount is written by the agent in the bot.',

  // Errors
  'errors.title': 'Something went wrong',
  'errors.subtitle': 'An unexpected error occurred',
  'errors.tryAgain': 'Try Again',
  'errors.reload': 'Reload Page',
  'errors.clearAndReload': 'Clear Data & Reload',
  'errors.showDetails': 'Show Error Details',
  'errors.support': 'If the problem persists, contact support',
  'error.panel_crashed': 'Panel Error',
  'error.panel_desc': 'This panel encountered an error. Try reloading.',
  'error.retry': 'Retry',

  // Accessibility
  'a11y.skipToContent': 'Skip to main content',

  // Newsletter
  'newsletter.title': 'Stay Updated',
  'newsletter.subtitle':
    'Get the latest AI video creation tips and product updates',
  'newsletter.placeholder': 'Enter your email',
  'newsletter.subscribe': 'Subscribe',
  'newsletter.success': 'Thanks for subscribing!',
  'newsletter.error': 'Subscription failed. Please try again.',
  'newsletter.invalidEmail': 'Please enter a valid email address',

  // Footer
  'footer.tagline': 'Social network for creating reels with AI',
  'footer.product': 'Product',
  'footer.features': 'Features',
  'footer.pricing': 'Pricing',
  'footer.feed': 'Feed',
  'footer.company': 'Company',
  'footer.about': 'About',
  'footer.blog': 'Blog',
  'footer.careers': 'Careers',
  'footer.support': 'Support',
  'footer.docs': 'Documentation',
  'footer.help': 'Help Center',
  'footer.contact': 'Contact',
  'footer.legal': 'Legal',
  'footer.privacy': 'Privacy Policy',
  'footer.terms': 'Terms of Service',
  'footer.rights': 'All rights reserved.',

  // Editor Header
  'editor.export': 'Export',
  'editor.exporting': 'Rendering...',
  'editor.settings': 'Settings',
  'editor.save': 'Save Project',
  'editor.saveTemplate': 'Save as Template',
  'editor.load': 'Load Project',
  'editor.reset': 'Reset to Defaults',
  'editor.undo': 'Undo',
  'editor.redo': 'Redo',
  'editor.projectName': 'Project Name',
  'editor.history': 'History',
  'editor.fileOps': 'File Operations',

  // Settings Modal
  'settings.title': 'Settings',
  'settings.export': 'Export',
  'settings.codec': 'Codec',
  'settings.quality': 'Quality',
  'settings.shortcuts': 'Keyboard Shortcuts',
  'settings.project': 'Project',
  'settings.name': 'Name',
  'settings.resolution': 'Resolution',
  'settings.fps': 'FPS',
  'settings.duration': 'Duration',
  'settings.connections': 'Social Connections',
  'settings.notConnected': 'Not connected',
  'settings.connect': 'Connect',
  'settings.disconnect': 'Disconnect',

  // Dialogs
  'dialog.reset.title': 'Reset to Defaults?',
  'dialog.reset.text':
    'All changes will be lost. Timeline, assets, and settings will be restored to their original state.',
  'dialog.reset.warning': 'This action cannot be undone.',
  'dialog.cancel': 'Cancel',
  'dialog.reset': 'Reset',
  'dialog.exportAnyway': 'Export Anyway',

  // Blob Warning
  'blob.title': 'Local Files Detected',
  'blob.text':
    'The following files are stored locally and will be skipped during export:',
  'blob.hint':
    'To include these files, delete and re-upload them. They will be stored in the cloud.',
  'blob.criticalTitle': 'Cannot Export',
  'blob.criticalText':
    'The following required files are stored locally and cannot be accessed by the render server:',
  'blob.criticalHint':
    'Upload your lipsync video to the cloud first. Go to Assets panel, delete the local file and re-upload it.',
  'dialog.ok': 'OK',

  // Login Modal
  'login.title': 'Login to Export',
  'login.tgSignedTitle': 'You are already signed in',
  'login.tgSignedBody':
    'Telegram already identified you — no separate login exists inside the Mini App.',
  'login.tgContinue': 'Continue',
  'templates.canons': 'Server templates',
  'templates.noneOnServer': 'The server has no renderable templates yet.',
  'common.close': 'Close',
  'login.tgUnsignedTitle': 'Open the app from the menu button',
  'login.tgUnsignedBody':
    "This launch carries no signed data, so the server cannot verify who you are. Open the app from the bot's menu button or an inline button, and everything will work.",
  'login.subtitle': 'Sign in with Telegram to get 3 free video renders!',
  'login.returnToGame': 'Sign in with Telegram to return to the game.',
  // The game's TRI frame, a screen that needs a person (EmbedGuestGate.tsx).
  'embed.guest.title': 'Sign in to use this with your name',
  'embed.guest.body':
    'You are here as a guest. Sign in with Telegram on app.t27.ai, and you will come back to this screen.',
  'embed.guest.signIn': 'Sign in with Telegram',
  'login.button': 'Login',
  'login.buttonFull': 'Sign in with Telegram',

  // Quota
  'quota.unlimited': 'Unlimited',
  'quota.left': 'left',
  'quota.free': 'free',

  // Properties Panel
  'props.properties': 'Properties',
  'props.batchEdit': 'Batch Edit',
  'props.items': 'items',
  'props.adjustDuration': 'Adjust Duration',
  'props.makeSameDuration': 'Make Same Duration',
  'props.setsAllToShortest': 'Sets all to shortest',
  'props.selectionInfo': 'Selection Info',
  'props.content': 'Content',
  'props.style': 'Style',
  'props.fontSize': 'Font Size',
  'props.color': 'Color',
  'props.weight': 'Weight',
  'props.align': 'Align',
  'props.left': 'Left',
  'props.center': 'Center',
  'props.right': 'Right',
  'props.position': 'Position',
  'props.opacity': 'Opacity',
  'props.timing': 'Timing',
  'props.start': 'Start',
  'props.duration': 'Duration',
  'props.media': 'Media',
  'props.lipsyncVideo': 'Lipsync Video',
  'props.coverImage': 'Cover Image',
  'props.backgroundMusic': 'Background Music',
  'props.effects': 'Effects',
  'props.musicVolume': 'Music Volume',
  'props.coverDuration': 'Cover Duration',
  'props.vignette': 'Vignette',
  'props.colorCorrection': 'Color Correction',
  'props.avatarCircle': 'Avatar Circle',
  'props.size': 'Size',
  'props.bottom': 'Bottom',
  'props.backgrounds': 'Backgrounds',
  'props.videos': 'videos',
  'props.dragVideosHint': 'Drag videos to Video track to change backgrounds',
  'props.enterText': 'Enter text...',

  // Duration adjustment buttons
  'props.minus1s': '-1 second',
  'props.minus05s': '-0.5 second',
  'props.plus05s': '+0.5 second',
  'props.plus1s': '+1 second',
  'props.pathPlaceholder': '/path/to/file',

  // Section headers
  'section.text': 'Text',
  'section.style': 'Style',
  'section.position': 'Position',
  'section.timing': 'Timing',
  'section.layout': 'Layout',
  'section.media': 'Media',
  'section.effects': 'Effects',
  'section.avatar': 'Avatar Circle',
  'section.backgrounds': 'Backgrounds',
  'section.audio': 'Audio',

  // Properties - Volume
  'props.volume': 'Volume',

  // Font weights
  'font.light': 'Light',
  'font.regular': 'Regular',
  'font.medium': 'Medium',
  'font.semibold': 'SemiBold',
  'font.bold': 'Bold',
  'font.extrabold': 'ExtraBold',

  // TrackItem
  'track.clickToAdjustVolume': 'Click to adjust volume',

  // Auth
  'auth.logout': 'Logout',
  'auth.logoutAll': 'Sign out on all devices, including this one',
  'auth.logoutAllShort': 'Sign out everywhere',

  // Captions preview
  'captions.previewText': 'Hello',

  // Layers Panel
  'layers.addText': 'Add Text',
  'layers.hideTrack': 'Hide track',
  'layers.showTrack': 'Show track',
  'layers.lockTrack': 'Lock track',
  'layers.unlockTrack': 'Unlock track',
  'layers.selected': 'selected',
  'layers.delete': 'Delete',

  // Captions Panel
  'captions.title': 'Captions',
  'captions.style': 'Style',
  'captions.hide': 'Hide captions',
  'captions.show': 'Show captions',
  'captions.addAt': 'Add at',
  'captions.add': 'Add',
  'captions.uploadHint': 'Upload .srt or .vtt file',
  'captions.import': 'Import',
  'captions.transcribeHint': 'Auto-transcribe Russian audio using Whisper',
  'captions.transcribing': 'Transcribing...',
  'captions.transcribe': 'Transcribe RU',
  'captions.empty': 'No captions yet',
  'captions.emptyHint': 'Add manually or import .srt/.vtt file',
  'captions.text': 'Text',
  'captions.fontSize': 'Font Size',
  'captions.fontWeight': 'Font Weight',
  'captions.font': 'Font',
  'captions.cyrillic': 'Cyrillic',
  'captions.searchFonts': 'Search fonts...',
  'captions.popular': 'Popular',
  'captions.allFonts': 'All Fonts',
  'captions.noFonts': 'No fonts found',
  'captions.colors': 'Colors',
  'captions.textColor': 'Text Color',
  'captions.highlight': 'Highlight',
  'captions.background': 'Background',
  'captions.position': 'Position',
  'captions.bottomPercent': 'Bottom %',
  'captions.maxWidth': 'Max Width %',
  'captions.effects': 'Effects',
  'captions.textShadow': 'Text Shadow',
  'captions.animation': 'Animation',
  'captions.current': 'Current',
  'captions.noVideoLoaded':
    'No video loaded. Please add a lip-sync video first.',
  'captions.noVideo': 'No video loaded. Please add a lip-sync video first.',
  'captions.transcriptionFailed': 'Transcription failed:',
  'captions.parseError':
    'Could not parse captions from file. Please check the format.',

  // Assets Panel
  'assets.dropOrClick': 'Drop files or click to upload',
  'assets.uploadsToCloud': 'Uploads to S3 cloud',
  'assets.uploading': 'Uploading...',
  'assets.done': 'Done',
  'assets.error': 'Error',
  'assets.videos': 'Videos',
  'assets.images': 'Images',
  'assets.audio': 'Audio',
  'assets.localWarning':
    'Local file - will be skipped during export!\nRe-upload to fix.',
  'assets.doubleClickHint': 'Double-click or drag to timeline',
  'assets.localNoExport': "Local file - won't export",
  'assets.noVideos': 'No videos yet',
  'assets.noImages': 'No images yet',
  'assets.noAudio': 'No audio files yet',
  'assets.noVoice': 'Voice files will appear here from AI generation',
  'assets.noMusic': 'No music files yet. Upload or generate music.',

  // Chat Panel
  'chat.offlineMessage':
    "I'm currently offline. The AI server will connect automatically when available. In the meantime, you can explore the template properties in the left panel.",
  'chat.applied': 'Applied:',
  'chat.failedToApply': 'Failed to apply action:',
  'chat.unknownError': 'Unknown error',
  'chat.agent': 'VIBEE Agent',
  'chat.connected': 'Connected',
  'chat.offline': 'Offline',
  'chat.clearChat': 'Clear chat',
  'chat.chat': 'Chat',
  'chat.logs': 'Logs',
  'chat.capturedLogs': 'captured logs',
  'chat.templateProps': 'template properties',
  'chat.errors': 'errors',
  'chat.placeholder': 'Describe what you want to create...',
  'chat.messagePlaceholder': 'Message the agent…',
  'chat.send': 'Send',
  'chat.welcome':
    "Hi! I'm your VIBEE AI assistant. I can help you create and edit video templates. What would you like to build today?",
  'chat.cleared': 'Chat cleared. How can I help?',

  // Templates Panel
  'templates.title': 'Templates',
  'templates.pageSubtitle': 'Your saved templates and presets',
  'templates.saveTitle': 'Save as Template',
  'templates.saveDescription':
    'Save current settings with all assets as a reusable template.',
  'templates.namePlaceholder': 'Template name',
  'templates.save': 'Save Template',
  'templates.delete': 'Delete template',
  'templates.confirmDelete': 'Are you sure you want to delete this template?',

  // Timeline
  'timeline.skipToStart': 'Skip to start',
  'timeline.pause': 'Pause',
  'timeline.play': 'Play',
  'timeline.skipToEnd': 'Skip to end',
  'timeline.slower': 'Slower',
  'timeline.faster': 'Faster',
  'timeline.unmute': 'Unmute audio',
  'timeline.mute': 'Mute audio',
  'timeline.volume': 'Volume',
  'timeline.snapToGrid': 'Snap to grid',
  'timeline.on': 'ON',
  'timeline.off': 'OFF',
  'timeline.zoomOut': 'Zoom out',
  'timeline.zoomIn': 'Zoom in',
  'timeline.fitToView': 'Fit to view',
  'timeline.title': 'Timeline',
  'timeline.controls': 'Transport Controls',
  'timeline.speed': 'Playback Speed',
  'timeline.zoom': 'Timeline Zoom',
  'timeline.currentTime': 'Current Time',
  'timeline.in': 'In',
  'timeline.out': 'Out',
  'timeline.assetNotCompatible': 'Asset type not compatible with track',
  'timeline.solo': 'Solo this track',
  'timeline.unsolo': 'Unsolo this track',
  'timeline.reorderTrack': 'Drag to reorder',

  // Volume Popup
  'volume.musicVolume': 'Music Volume',
  'volume.avatarVolume': 'Avatar Volume',
  'volume.videoVolume': 'Video Volume',
  'volume.mute': 'Mute',
  'volume.clickToAdjust': 'Click to adjust volume',

  // Canvas
  'canvas.fullscreenNotSupported': 'Fullscreen not supported or blocked',
  'canvas.exitFullscreen': 'Exit fullscreen',
  'canvas.fullscreen': 'Fullscreen',
  'canvas.transcribingAudio': 'Transcribing audio...',
  'canvas.loadingCaptions': 'Loading captions...',
  'canvas.dropToAdd': 'Drop to add',

  // Paywall
  'paywall.junior': 'JUNIOR',
  'paywall.middle': 'MIDDLE',
  'paywall.senior': 'SENIOR',
  'paywall.rendersMonth': 'renders/month',
  'paywall.hdQuality': 'HD quality',
  'paywall.4kQuality': '4K quality',
  'paywall.emailSupport': 'Email support',
  'paywall.prioritySupport': 'Priority support',
  'paywall.premiumSupport': 'Premium support',
  'paywall.customFonts': 'Custom fonts',
  'paywall.apiAccess': 'API access',
  'paywall.unlimitedRenders': 'Unlimited renders',
  'paywall.card': 'Card',
  'paywall.stars': 'Stars',
  'paywall.ton': 'TON',
  'paywall.freeUsedUp': 'Free Renders Used Up!',
  'paywall.subscribeMessage':
    "You've used all your free renders. Subscribe to continue creating amazing videos.",
  'paywall.mostPopular': 'Most Popular',
  'paywall.perMonth': '/month',
  'paywall.securePayments':
    'All payments are secure and processed via Telegram',

  // Auth
  'auth.login': 'Login',
  'auth.signInTelegram': 'Sign in with Telegram',

  // Context Menu
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.duplicate': 'Duplicate',
  'menu.color': 'Color',
  'menu.delete': 'Delete',
  'menu.noColor': 'No color',
  'color.red': 'Red',
  'color.orange': 'Orange',
  'color.yellow': 'Yellow',
  'color.green': 'Green',
  'color.blue': 'Blue',
  'color.purple': 'Purple',
  'color.pink': 'Pink',

  // Header Alerts
  'editor.invalidFormat': 'Invalid project file format',
  'editor.importSuccess': 'Project imported successfully!',
  'editor.importFailed': 'Failed to import project. Invalid JSON format.',
  'editor.exportFailed': 'Export failed',
  'editor.connectionLost': 'Lost connection to render server',
  'editor.unknownError': 'Unknown error',

  // Tab Tooltips
  'tabs.feed': 'Feed',
  'tabs.blog': 'Blog',
  'tabs.search': 'Search',
  'tabs.profile': 'Profile',
  'tabs.script': 'Script',
  'tabs.templates': 'Templates',
  'tabs.assets': 'Assets',
  'tabs.player': 'Player',
  'tabs.editor': 'Editor',
  'tabs.ai': 'AI',
  'tabs.avatar': 'Lipsync',
  'tabs.layers': 'Layers',
  'tabs.properties': 'Properties',
  'tabs.captions': 'Captions',

  // Feed
  'feed.title': 'Community Feed',
  'feed.recent': 'Recent',
  'feed.popular': 'Popular',
  'feed.refresh': 'Refresh',
  'feed.loading': 'Loading...',
  'feed.empty': 'No templates yet',
  'feed.loadMore': 'Load More',
  'feed.retry': 'Retry',
  'feed.useTemplate': 'Use Template',
  'feed.using': 'Loading...',
  'feed.like': 'Like',
  'feed.star': 'Send a Star to the author',
  'feed.today': 'Today',
  'feed.yesterday': 'Yesterday',
  'feed.remixing': 'Remixing template...',
  'feed.remixHint': 'Record your own voice & cameo to make it yours!',
  'feed.for_you': 'For You',
  'feed.following': 'Following',
  'feed.justNow': 'Just now',
  // Короткие единицы возраста карточки: «36m», «3h», «1d». Были зашиты в
  // FeedCard латиницей рядом с уже переведённым feed.justNow — то есть
  // перевод начали и бросили на середине функции.
  'feed.ageMin': 'm',
  'feed.ageHour': 'h',
  'feed.ageDay': 'd',
  'feed.ageWeek': 'w',
  'feed.ageMonth': 'mo',
  'feed.remix': 'Remix',
  'feed.remixBasedOn': 'Based on another template',
  // Заголовок вкладки, когда бренд партнёра не задан. Канон имени —
  // «Trinity S³AI» с надстрочной тройкой, как в шапке и в рилсах.
  'app.title': 'Trinity S³AI — reels on autopilot',
  'feed.videoError': 'Video failed to load',
  'feed.deleteConfirm': 'Delete this video?',

  // Publish Modal
  'publish.title': 'Share to Feed',
  'publish.subtitle': 'Publish your creation to the community feed',
  'publish.name': 'Name',
  'publish.namePlaceholder': 'Enter a name for your video',
  'publish.nameRequired': 'Please enter a name',
  'publish.description': 'Description',
  'publish.descPlaceholder': 'Tell others about your creation...',
  'publish.share': 'Share to Feed',
  'publish.publishing': 'Publishing...',
  'publish.success': 'Published!',
  'publish.successDesc': 'Your creation is now live in the community feed',
  'publish.failed': 'Failed to publish. Please try again.',
  'publish.noVideo': 'No video to publish',
  'publish.remixOf': 'Remix of',
  'publish.postToTelegram': 'Also post to Telegram',
  'publish.postToInstagram': 'Also post to Instagram',
  'publish.connectInstagram': 'Connect Instagram',
  'publish.instagramUnavailable':
    'Instagram posting is not set up on this server yet',
  'publish.captionPreview': 'Post preview',

  // Instagram callback
  'instagram.connecting': 'Connecting Instagram...',
  'instagram.success': 'Instagram connected successfully!',
  'instagram.successMessage': 'You can now publish videos to Instagram.',
  'instagram.done': 'Done!',
  'instagram.openingShare': 'Opening share dialog...',
  'instagram.failed': 'Connection Failed',
  'instagram.missingCode': 'Missing authorization code',
  'instagram.networkError': 'Network error. Please try again.',
  'instagram.backToEditor': 'Back to Editor',
  'publish.generateAI': 'AI Caption',
  'publish.captionPlaceholder': 'Write your caption...',
  'publish.resetCaption': 'Reset to default',

  // Notifications
  'notifications.title': 'Notifications',
  'notifications.all': 'All',
  'notifications.unread': 'Unread',
  'notifications.empty': 'No notifications yet',
  'notifications.mark_read': 'Mark as read',
  'notifications.mark_all_read': 'Mark all as read',
  'notifications.clear_all': 'Clear all notifications',
  'notifications.liked_video': 'liked your video',
  'notifications.commented': 'commented on your video',
  'notifications.followed': 'started following you',
  'notifications.mentioned': 'mentioned you',
  'notifications.video_ready': 'Your video is ready',

  // Stories
  'stories.your_story': 'Your story',
  'stories.add': 'Add story',

  // Messages
  'messages.title': 'Messages',
  'messages.search': 'Search messages...',
  'messages.empty': 'No messages yet',
  'messages.placeholder': 'Message...',

  // Analytics
  'analytics.title': 'Analytics',
  'analytics.overview': 'Overview',
  'analytics.content': 'Content',
  'analytics.audience': 'Audience',
  'analytics.last7days': 'Last 7 days',
  'analytics.last30days': 'Last 30 days',
  'analytics.last90days': 'Last 90 days',
  'analytics.allTime': 'All time',
  'analytics.views': 'Views',
  'analytics.likes': 'Likes',
  'analytics.comments': 'Comments',
  'analytics.followers': 'Followers',
  'analytics.videos': 'videos',
  'analytics.avgWatch': 'avg watch',
  'analytics.shares': 'shares',
  'analytics.viewsOverTime': 'Views over time',
  'analytics.topVideos': 'Top Videos',
  'analytics.ageDistribution': 'Age Distribution',
  'analytics.topCountries': 'Top Countries',

  // Sound
  'sound.original': 'Original Sound',
  'sound.use': 'Use',
  'sound.useThis': 'Use this sound',
  'sound.save': 'Save',
  'sound.saved': 'Saved',
  'sound.videos': 'videos',
  'sound.originalSound': 'Original sound',

  // Remix Badge
  'remix.badge': 'Remix',
  'remix.of': 'Remix of',
  'remix.by': 'by',
  'remix.original': 'Original by',

  // Player
  'player.pause': 'Pause',
  'player.play': 'Play',

  // Player Panel Settings
  'player.music': 'Music',
  'player.musicVolume': 'Volume',
  'player.effects': 'Effects',
  'player.vignette': 'Vignette',
  'player.colorCorrection': 'Color',
  'player.avatar': 'Avatar',
  'player.autoDetect': 'Face Detection',
  'player.detect': 'Detect',
  'player.detecting': 'Detecting...',
  'player.circle': 'Circle',
  'player.borderRadius': 'Radius',
  'player.avatarSize': 'Size',
  'player.positionX': 'Position X',
  'player.positionY': 'Position Y',
  'player.faceScale': 'Face Scale',
  'player.captions': 'Captions',
  'player.showCaptions': 'Show',
  'player.playback': 'Playback',
  'player.playbackSpeed': 'Speed',
  'player.split': 'Split',
  'player.fullscreen': 'Fullscreen',
  'player.reset': 'Reset to defaults',
  'player.animation': 'Animation',
  'player.avatarEffect': 'Avatar Effect',
  'player.none': 'None',

  // Border Effect
  'player.borderEffect': 'Border Effect',
  'player.effectType': 'Effect Type',
  'player.solid': 'Solid',
  'player.neon': 'Neon Glow',
  'player.rainbow': 'Rainbow',
  'player.glass': 'Glass',
  'player.gradient': 'Gradient',
  'player.pulse': 'Pulse',
  'player.glow': 'Soft Glow',
  'player.double': 'Double',
  'player.neonPulse': 'Neon Pulse',
  'player.fire': 'Fire',
  'player.ocean': 'Ocean',
  'player.sunset': 'Sunset',
  'player.electric': 'Electric',
  'player.holographic': 'Holographic',
  'player.borderColor': 'Border Color',
  'player.borderColor2': 'Color 2',
  'player.borderWidth': 'Border Width',
  'player.borderIntensity': 'Intensity',

  // WebSocket
  'ws.syncActive': 'Real-time sync active',
  'ws.connecting': 'Connecting to sync server...',

  // Codec Options
  'codec.h264': 'H.264 (MP4) - Best compatibility',
  'codec.h265': 'H.265 (HEVC) - Smaller size',
  'codec.vp9': 'VP9 (WebM) - Web optimized',
  'codec.prores': 'ProRes - Professional',

  // Quality Options
  'quality.high': 'High (1080p)',
  'quality.medium': 'Medium (720p)',
  'quality.low': 'Low (480p)',

  // Keyboard Shortcuts
  'shortcuts.title': 'Keyboard Shortcuts',
  'shortcuts.playback': 'Playback',
  'shortcuts.editing': 'Editing',
  'shortcuts.selection': 'Selection',
  'shortcuts.navigation': 'Navigation',
  'shortcuts.view': 'View',
  'shortcut.playPause': 'Play / Pause',
  'shortcut.rewind1s': 'Rewind 1 second',
  'shortcut.pause': 'Pause',
  'shortcut.forward1s': 'Forward 1 second',
  'shortcut.prevFrame': 'Previous frame',
  'shortcut.nextFrame': 'Next frame',
  'shortcut.back1Frame': 'Back 1 frame',
  'shortcut.forward1Frame': 'Forward 1 frame',
  'shortcut.back10Frames': 'Back 10 frames',
  'shortcut.forward10Frames': 'Forward 10 frames',
  'shortcut.goToStart': 'Go to start',
  'shortcut.goToEnd': 'Go to end',
  'shortcut.jkl': '-1s / Pause / +1s',
  'shortcut.undo': 'Undo',
  'shortcut.redo': 'Redo',
  'shortcut.selectAll': 'Select All',
  'shortcut.copy': 'Copy',
  'shortcut.paste': 'Paste',
  'shortcut.duplicate': 'Duplicate',
  'shortcut.delete': 'Delete',
  'shortcut.deleteWithGap': 'Delete and close gap',
  'shortcut.splitAtPlayhead': 'Split at playhead',
  'shortcut.clearSelection': 'Clear Selection',
  'shortcut.addToSelection': 'Add to selection',
  'shortcut.selectRange': 'Select range',
  'shortcut.toSelectionStart': 'To selection start',
  'shortcut.toSelectionEnd': 'To selection end',
  'shortcut.setInPoint': 'Set In point',
  'shortcut.setOutPoint': 'Set Out point',
  'shortcut.resetInOut': 'Reset In/Out points',
  'shortcut.toggleMarker': 'Add/remove marker',
  'shortcut.nextMarker': 'To next marker',
  'shortcut.prevMarker': 'To previous marker',
  'shortcut.move1Frame': 'Move 1 Frame',
  'shortcut.move10Frames': 'Move 10 Frames',
  'shortcut.goToStartEnd': 'Go to Start / End',
  'shortcut.zoomInOut': 'Zoom In / Out',
  'shortcut.fitTimeline': 'Fit to window',
  'shortcut.showShortcuts': 'Show shortcuts',

  // Canvas
  'canvas.zoomOut': 'Zoom out',
  'canvas.zoomIn': 'Zoom in',

  // Loading
  'loading.editor': 'Loading Editor...',

  // Layers - additional
  'layers.newText': 'New Text',

  // Generate Panel
  'generate.title': 'Generate',
  'generate.image': 'Image',
  'generate.video': 'Video',
  'generate.audio': 'Voice',
  'generate.lipsync': 'Lipsync',
  'generate.model': 'Model',
  'generate.prompt': 'Prompt',
  'generate.promptPlaceholder': 'Describe what you want to generate...',
  'generate.videoPromptPlaceholder': 'Describe the video scene...',
  'generate.textPlaceholder': 'Enter text to convert to speech...',
  'generate.aspectRatio': 'Aspect Ratio',
  'generate.duration': 'Duration',
  'generate.resolution': 'Resolution',
  'generate.voice': 'Voice',
  'generate.music': 'Music',
  'generate.text': 'Text',
  'generate.speed': 'Speed',
  'generate.audioUrl': 'Audio URL',
  'generate.imageUrl': 'Image URL',
  'generate.generating': 'Generating...',
  'generate.generateImage': 'Generate Image',
  'generate.generateVideo': 'Generate Video',
  'generate.generateAudio': 'Generate Audio',
  'generate.generateLipsync': 'Generate Lipsync',
  'generate.error': 'Generation failed. Please try again.',
  'tabs.generate': 'Generate',
  'generate.audioSource': 'Voice Audio',
  'generate.uploadAudio': 'Upload',
  'generate.recordAudio': 'Record',
  'generate.saveRecording': 'Save',
  'generate.imageSource': 'Avatar Image',
  'generate.uploadImage': 'Upload Photo',
  'generate.myPhotos': 'My photos — one photo, all content',
  'generate.myPhotosEmpty':
    'No saved photos yet: upload one and save it — lipsync will take the face from here',
  'generate.saveToAvatar': 'Save photo to avatar',
  'generate.savedToAvatar': 'Saved',
  'generate.results': 'Results',
  'generate.dragHint': 'Drag to timeline',
  'generate.addToTimeline': 'Add to timeline',
  'generate.remove': 'Remove',

  // Results Gallery
  'results.noImages': 'No images generated yet',
  'results.noVideos': 'No videos generated yet',
  'results.noAudio': 'No audio generated yet',
  'results.noLipsync': 'No lipsync videos generated yet',

  // Comments
  'comments.title': 'Comments',
  'comments.empty': 'No comments yet',
  'comments.be_first': 'Be the first to comment!',
  'comments.placeholder': 'Add a comment...',
  'comments.reply': 'Reply',
  'comments.replying_to': 'Replying to',
  'comments.delete': 'Delete',

  // Panels
  'panels.properties': 'Properties',

  // Profile
  'profile.edit': 'Edit',
  'profile.edit_template': 'Edit',
  'profile.delete_template': 'Delete',
  'profile.preview_template': 'Preview',
  'profile.pause_preview': 'Pause preview',
  'profile.delete_template_confirm': 'Remove this template from your profile?',
  'profile.template_action_failed':
    'Could not update the template. Sign in and try again.',
  'profile.edit_cover': 'Edit Cover',
  'profile.followers': 'Followers',
  'profile.following': 'Following',
  'profile.videos': 'Videos',
  'profile.views': 'Views',
  'profile.likes': 'Likes',
  'profile.templates': 'Templates',
  'profile.follow': 'Follow',
  'profile.following_btn': 'Following',
  'profile.unfollow': 'Unfollow',
  'profile.no_followers': 'No followers yet',
  'profile.no_followers_desc': 'Share your profile to get followers',
  'profile.no_following': 'Not following anyone',
  'profile.no_following_desc': 'Find creators to follow',
  'profile.no_templates': 'No videos yet',
  'profile.no_templates_desc': 'Create your first AI video to share',
  'profile.create_first_video': 'Create First Video',
  'profile.load_more': 'Load More',
  'profile.loading': 'Loading profile...',
  'profile.not_found': 'User not found',
  'soul.title': 'My SOUL — the agent writes in my voice',
  'soul.hint':
    'This card is read by the agent before every answer: your posts are written in YOUR voice, not average. Edit here — or just ask the agent in chat («add to my SOUL…»).',
  'soul.save': 'Save',
  'soul.saved': 'Saved',
  'soul.fillTemplate': 'Fill template',
  'soul.skillsTitle': 'Agent skills (9)',
  'soul.skillsHint':
    'Everything the agent can do right now — the same list it uses itself. Skills marked with soul_ edit YOUR SOUL.',
  'soul.skill.whoami': 'who you are in the app',
  'soul.skill.feed_stats': 'feed summary: authors, reels, views, likes',
  'soul.skill.feed_list': 'latest reels (yours or public)',
  'soul.skill.feed_get': 'one reel in full with layers — for remix',
  'soul.skill.templates_list': 'reel templates from the render bundle',
  'soul.skill.my_assets': 'your files: photos, videos, voice',
  'soul.skill.feed_publish': 'publish a reel (text with hashtags required)',
  'soul.skill.soul_get': 'read your SOUL',
  'soul.skill.soul_edit': 'edit your SOUL on request — like a skill',
  'profile.not_found_desc': "This profile doesn't exist or has been deleted",
  'profile.gate.title': 'Connect your Telegram to open the profile',
  'profile.gate.body':
    'The agent writes and reads on your behalf, so it needs your own Telegram signed in by phone. One time; you can disconnect from the Agent tab later.',
  // ── Welcome road on the profile (value -> club -> Telegram -> SOUL) ──────
  'welcome.step': 'Step {n} of {total}',
  'welcome.next': 'Next',
  'welcome.value.title': 'A digital twin that works your Telegram for you',
  'welcome.value.lead':
    'Not a chatbot in one window. An agent that speaks in your voice, keeps your feed alive and knows what you sell.',
  'welcome.value.dm':
    'Answers in DMs and groups on your behalf, remembers the thread, never forgets a client',
  'welcome.value.reels':
    'Makes reels, images and voice-overs in your style — not stock, yours',
  'welcome.value.plan':
    'Keeps a content plan and publishes on schedule while you work',
  'welcome.value.blog':
    'Writes your blog and reads the analytics so the next post is better than the last',
  'welcome.value.note':
    'We do not promise reach or income figures: the numbers come from your content and your audience. What we promise is the time you get back.',
  'welcome.how.title': 'How it is built',
  'welcome.how.lead':
    'Three parts. Each one is yours and each one can be switched off.',
  'welcome.how.soul':
    'SOUL.md — who you are, what you sell, how you sound, what is forbidden. The twin is built on it.',
  'welcome.how.telegram':
    'Your Telegram, signed in by phone — so the twin writes as you, not as a bot.',
  'welcome.how.tokens':
    'Tokens on a balance — every answer, image, voice-over and reel is paid from it; a text answer costs the least, a video the most.',
  'welcome.how.note':
    'You see every charge in the chat. There are no hidden fees and no tariffs besides the club and token packs.',
  'welcome.club.title': 'Entering the club',
  'welcome.club.lead':
    'One payment in Telegram Stars opens the twin. Part of it comes straight back to you as tokens.',
  'welcome.club.per': 'per {days} days',
  'welcome.club.tokens':
    '{tokens} tokens land on your balance with every charge',
  'welcome.club.share': '(30% of the payment)',
  'welcome.club.badge': 'Club',
  'welcome.club.renew':
    'Renews inside Telegram every 30 days — no cards, no forms',
  'welcome.club.topup':
    'Tokens ran out early? Top up with an ordinary pack in the chat',
  'welcome.club.cancel':
    'Cancel any time: Telegram → Settings → My Stars → subscriptions',
  'welcome.club.loading': 'Asking the server for the price…',
  'welcome.club.retry': 'Ask the price again',
  'welcome.club.join': 'Join for {stars} Stars',
  'welcome.club.going': 'Opening the invoice…',
  'welcome.club.pending':
    'Telegram says paid, but the ledger has not shown the charge yet. It is booked automatically within the hour — come back and the road continues.',
  'welcome.club.unsupported':
    'Stars invoices open only inside Telegram. Open this page from the Mini App.',
  'welcome.club.cancelled':
    'The invoice was closed without paying. Nothing was charged.',
  'welcome.club.failed':
    'Telegram could not complete the payment. Nothing was charged; try again.',
  'welcome.connect.title': 'Now sign in with your phone',
  'welcome.connect.body':
    'The twin needs your own Telegram to write as you. One time; you can disconnect later.',
  'welcome.connect.who':
    'Who: only you, the owner of this profile, on this device.',
  'welcome.connect.what':
    'What: a Telegram session in your name — phone, code from Telegram, your cloud password if set.',
  'welcome.connect.why':
    'Why: so the twin can answer your DMs and groups and publish to your channels.',
  'welcome.connect.howlong':
    'How long: until you disconnect. The session is stored encrypted; the code and password are typed only by you and are not kept.',
  'welcome.connect.off':
    'How to switch off: the Agent tab → Disconnect, or Telegram → Devices → end the session.',
  'welcome.connect.warn':
    'Telegram will send you a "new login" notice. That is this connection — not a stranger.',
  'welcome.soul.title': 'Write your SOUL.md',
  'welcome.soul.lead':
    'Four short answers. The twin is built on them — you can edit the full file later in the SOUL tab.',
  'welcome.soul.who': 'Who you are',
  'welcome.soul.who.hint': 'One line: what you do and what people know you for',
  'welcome.soul.sell': 'What you sell',
  'welcome.soul.sell.hint':
    'Service, product, partnerships — what your content is for',
  'welcome.soul.voice': 'Your voice',
  'welcome.soul.voice.hint': 'How to sound: "plain, friendly, no jargon"',
  'welcome.soul.forbidden': 'What is forbidden',
  'welcome.soul.forbidden.hint':
    'What the twin must never write: topics, words, promises',
  'welcome.soul.save': 'Save and continue',
  'welcome.soul.saving': 'Saving…',
  'welcome.done.title': 'The twin is ready',
  'welcome.done.body':
    'Club, Telegram and SOUL are in place. From here the agent works; you steer.',
  'welcome.done.first':
    'Write to the agent in the chat — ask for a first reel, a plan for the week or a reply to a client.',
  'welcome.done.soul':
    'The SOUL tab holds the full file; the twin re-reads it on every change.',
  'welcome.done.go': 'Open my profile',
  'welcome.done.play': 'Into the hive',
  'profile.edit_profile': 'Edit Profile',
  'profile.display_name': 'Display Name',
  'profile.display_name_placeholder': 'Your name',
  'profile.bio': 'Bio',
  'profile.bio_placeholder': 'Tell us about yourself...',
  'profile.social_links': 'Social Links',
  'profile.add_link': 'Add Link',
  'profile.public_profile': 'Public Profile',
  'profile.public_profile_hint': 'When disabled, only you can see your profile',
  'profile.viewProfile': 'View Profile',
  'profile.save_error': 'Failed to save profile. Please try again.',

  // Common
  'common.back': 'Back',
  'common.save': 'Save',
  'common.saving': 'Saving...',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.go_home': 'Go Home',
  'common.undo': 'Undo',

  // Timeline Add Actions
  'timeline.addedTo': 'Added to {track}',
  'timeline.addToStart': 'Add to Start',
  'timeline.addToEnd': 'Add to End',
  'timeline.addAtPlayhead': 'Add at Playhead',
  'timeline.replaceSelected': 'Replace Selected',

  // Assets Batch Mode
  'assets.selectMode': 'Select Mode',
  'assets.addAll': 'Add All',
  'assets.selected': 'selected',
  'assets.clearSelection': 'Clear',

  // Bottom Navigation
  'nav.feed': 'Feed',
  'nav.search': 'Search',
  'nav.create': 'Editor',
  'nav.profile': 'Profile',
  'nav.learn': 'Learn',
  'nav.agent': 'Agent',
  'nav.hive': 'Hive',
  'hive.loading': 'Opening the hive on t27.ai…',
  'hive.frameTitle': 'The hive — t27.ai/#/queen',
  'hive.openOutside': 'Open in the browser: t27.ai/#/queen ↗',
  'hive.insideGame':
    'You are already inside the game: the hive is the page around this frame.',
  // Sign-in inside the game's TRI frame on t27.ai (LoginModal).
  'embed.signInTitle': 'Sign in inside the app',
  'embed.signInBody':
    'Telegram does not let its sign-in load inside another site, and a sign-in made in the app does not carry over into this frame. Open this screen in the app to use it under your name.',
  'embed.openApp': 'Open this screen in the app ↗',
  'nav.editor': 'Editor',
  'nav.generate': 'Generate',
  'nav.templates': 'Templates',

  // Search Page
  'search.placeholder': 'Search users, templates...',
  'search.no_results': 'No results found',
  'search.trending': 'Trending',
  'search.discover': 'Discover Creators',
  'search.discover_hint': 'Search to find creators and templates',

  // Quick Actions (Long Press Menu)
  'quickActions.addToTimeline': 'Add to Timeline',
  'quickActions.addToStart': 'Add to Start',
  'quickActions.preview': 'Preview',
  'quickActions.setAsBackground': 'Set as Background',
  'quickActions.delete': 'Delete',

  // Search
  'search.all': 'All',

  // Canvas Controls
  'canvas.grid': 'Grid',
  'canvas.safeZone': 'Safe Zone',
  'canvas.resetZoom': 'Reset Zoom',

  // Toast Messages
  'toast.addedToTimeline': 'Added to timeline',
  'toast.removedFromTimeline': 'Removed from timeline',
  'toast.copied': 'Copied',
  'toast.assetUploaded': 'Asset uploaded',
  'toast.uploadFailed': 'Upload failed',
  'toast.undo': 'Undo',

  // Collections
  'assets.collections': 'Collections',
  'assets.newCollection': 'New Collection',
  'assets.allAssets': 'All Assets',
  'assets.collectionName': 'Collection name...',
  'assets.noCollections': 'No collections yet',
  'assets.createFirst': 'Create your first collection',
  'assets.addToCollection': 'Add to Collection',
  'actions.rename': 'Rename',
  'actions.delete': 'Delete',
  'actions.clearAll': 'Clear all',

  // Recent & Favorites
  'assets.recent': 'Recent',
  'assets.favorites': 'Favorites',
  'assets.noRecent': 'No recent assets',
  'assets.noFavorites': 'No favorites yet',

  // Time
  'time.justNow': 'Just now',
  'time.minAgo': 'm ago',
  'time.hourAgo': 'h ago',
  'time.dayAgo': 'd ago',

  // Empty States
  'empty.feed.title': 'No videos yet',
  'empty.feed.description': 'Be the first to share something awesome!',
  'empty.feed.action': 'Explore',
  'empty.search.title': 'Search for videos',
  'empty.search.description': 'Find creators, templates, and sounds',
  'empty.search.noResults': 'No results found',
  'empty.search.tryDifferent': 'Try different keywords',
  'empty.messages.title': 'No messages yet',
  'empty.messages.description': 'Start a conversation with someone',
  'empty.messages.action': 'Start Chat',
  'empty.notifications.title': 'No notifications',
  'empty.notifications.description': "You're all caught up!",
  'empty.likes.title': 'No likes yet',
  'empty.likes.description': 'Videos you like will appear here',
  'empty.bookmarks.title': 'No saved videos',
  'empty.bookmarks.description': 'Save videos to watch later',
  'empty.bookmarks.action': 'Explore',
  'empty.followers.title': 'No followers yet',
  'empty.followers.description': 'Share your videos to get followers',
  'empty.following.title': 'Not following anyone',
  'empty.following.description': 'Discover creators to follow',
  'empty.following.action': 'Discover',
  'empty.drafts.title': 'No drafts',
  'empty.drafts.description': 'Your unfinished videos will appear here',
  'empty.drafts.action': 'Create Video',
  'empty.assets.title': 'No assets yet',
  'empty.assets.description': 'Upload images, videos, or audio',
  'empty.assets.action': 'Upload',
  'empty.trending.title': 'Nothing trending',
  'empty.trending.description': 'Check back later for trending content',
  'empty.sounds.title': 'No saved sounds',
  'empty.sounds.description': 'Save sounds to use in your videos',
  'empty.sounds.action': 'Browse Sounds',
  'empty.archive.title': 'Archive is empty',
  'empty.archive.description': 'Archived content will appear here',
  'empty.history.title': 'No watch history',
  'empty.history.description': 'Videos you watch will appear here',

  // Onboarding
  'onboarding.welcome.title': 'Welcome to VIBEE',
  'onboarding.welcome.description':
    'Create amazing AI-powered videos in minutes',
  'onboarding.create.title': 'Create with AI',
  'onboarding.create.description':
    'Generate videos, images, and lipsync avatars',
  'onboarding.discover.title': 'Discover Content',
  'onboarding.discover.description': 'Explore trending videos and creators',
  'onboarding.share.title': 'Share & Grow',
  'onboarding.share.description': 'Share your creations with the world',
  'onboarding.community.title': 'Join Community',
  'onboarding.community.description': 'Connect with other creators',
  'onboarding.back': 'Back',
  'onboarding.next': 'Next',
  'onboarding.getStarted': 'Get Started',
  'onboarding.skip': 'Skip',

  // ===============================
  // Token Page (Investor Pitch)
  // ===============================

  // Header
  'token.nav.home': 'Home',
  'token.nav.editor': 'Editor',

  // Hero
  'token.hero.badge': 'Language for Safe Vibe Coding',
  'token.hero.title': 'VIBEE — Compile AI Code to Production-Ready Agents',
  'token.hero.tagline':
    'Compiler enforces @spec. Built-in payments. BEAM fault tolerance. Accept All without fear.',
  'token.hero.description':
    '45% of AI code has security vulnerabilities. VIBEE compiles AI-generated code into reliable BEAM agents with mandatory @spec checks and built-in payment layer. 10 lines of VIBEE vs 120 lines of Java.',
  'token.hero.stats.bugs': 'of AI code has vulnerabilities*',
  'token.hero.stats.vibee': 'with @spec enforcement',
  'token.hero.stats.safetyNet': '= compile-time safety',
  'token.hero.karpathy.quote':
    '"It\'s not really coding - I just see things, say things, run things, and copy-paste things, and it mostly works."',
  'token.hero.karpathy.cite':
    "— Andrej Karpathy (coined 'Vibe Coding', February 2025)",
  'token.hero.footnote': '*Veracode 2025 GenAI Code Security Report',
  'token.hero.cta.editor': 'Open Editor',
  'token.hero.cta.docs': 'Read Docs',
  'token.hero.cta.demo': 'Try Demo',

  // Killer Feature Section
  'token.killer.badge': '🚀 KILLER FEATURE',
  'token.killer.title': 'spec.yml → Complete Plugin with 100% Test Coverage',
  'token.killer.subtitle':
    'One YAML file → Production-ready code automatically',
  'token.killer.description':
    'Write behaviors in plain English. Get complete plugins with tests, docs, and type safety. This is what makes VIBEE worth billions.',
  'token.killer.stats.time': '5 minutes',
  'token.killer.stats.time_before': 'vs 40 hours',
  'token.killer.stats.cost': '$0',
  'token.killer.stats.cost_before': 'vs $2,000',
  'token.killer.stats.quality': '100% test coverage',
  'token.killer.stats.quality_before': 'Guaranteed',

  // Killer Feature - How It Works
  'token.killer.how.title': 'How It Works',
  'token.killer.how.step1.title': '1. Write spec.yml',
  'token.killer.how.step1.desc':
    'Describe behaviors in plain English with test cases',
  'token.killer.how.step2.title': '2. Run Generator',
  'token.killer.how.step2.desc': 'vibee generate honeycomb/your_plugin',
  'token.killer.how.step3.title': '3. Get Complete Plugin',
  'token.killer.how.step3.desc':
    'Functions, tests, docs, types - all generated',
  'token.killer.how.step4.title': '4. Implement & Test',
  'token.killer.how.step4.desc': 'Write implementation, tests already pass',

  // Killer Feature - Example
  'token.killer.example.title': 'Real Example: Telegram Bot',
  'token.killer.example.input': '400 lines YAML',
  'token.killer.example.output': '5,000+ lines code',
  'token.killer.example.behaviors': '15 behaviors',
  'token.killer.example.tests': '75 test cases',
  'token.killer.example.functions': '20 functions',
  'token.killer.example.coverage': '100% test coverage',

  // Market Comparison
  'token.comparison.title': 'Better Than Copilot, Cursor, Devin',
  'token.comparison.subtitle': '$10B code generation market',
  'token.comparison.copilot.name': 'GitHub Copilot',
  'token.comparison.copilot.price': '$100/month',
  'token.comparison.copilot.what': 'Code snippets',
  'token.comparison.copilot.tests': 'No',
  'token.comparison.copilot.docs': 'No',
  'token.comparison.cursor.name': 'Cursor AI',
  'token.comparison.cursor.price': '$20/month',
  'token.comparison.cursor.what': 'Code files',
  'token.comparison.cursor.tests': 'No',
  'token.comparison.cursor.docs': 'No',
  'token.comparison.devin.name': 'Devin AI',
  'token.comparison.devin.price': '$500/month',
  'token.comparison.devin.what': 'Full projects',
  'token.comparison.devin.tests': 'Sometimes',
  'token.comparison.devin.docs': 'Sometimes',
  'token.comparison.vibee.name': 'VIBEE',
  'token.comparison.vibee.price': '$50/month',
  'token.comparison.vibee.what': 'Complete plugins',
  'token.comparison.vibee.tests': '100% guaranteed',
  'token.comparison.vibee.docs': 'Full documentation',

  // Savings Calculator
  'token.savings.title': 'Calculate Your Savings',
  'token.savings.subtitle': 'See how much time and money VIBEE saves',
  'token.savings.plugins_per_month': 'Plugins per month',
  'token.savings.time_saved': 'Time saved',
  'token.savings.cost_saved': 'Cost saved',
  'token.savings.hours': 'hours/month',
  'token.savings.dollars': '$/month',
  'token.savings.cta': 'Start Saving Now',

  // spec.yml Example
  'token.spec.title': 'spec.yml Example',
  'token.spec.subtitle': 'See how simple it is',
  'token.spec.input.title': 'Input: spec.yml (400 lines)',
  'token.spec.input.code': `name: telegram_bot
version: 2.0.0
description: Telegram Bot with 45+ features

behaviors:
  - name: user_first_start
    given: New user sends /start command
    when: Create user record and show welcome
    then: User created, language selection shown
    test_cases:
      - name: new_user_no_ref
        input: {user_id: 123, username: "john"}
        expected: {created: true, scene: "welcome", bonus: 0}
      
      - name: new_user_with_ref
        input: {user_id: 123, ref: 456}
        expected: {created: true, referrer: 456, bonus: 100}

functions:
  - name: create_user
    params: {telegram_id: int, username: str?, language: str}
    returns: User

types:
  User:
    id: int
    telegram_id: int
    username: str?
    balance: int`,
  'token.spec.output.title': 'Output: Complete Plugin (5,000+ lines)',
  'token.spec.output.files': 'Generated files:',
  'token.spec.output.file1': '✅ src/telegram_bot.gleam - Function signatures',
  'token.spec.output.file2': '✅ test/telegram_bot_test.gleam - 75 unit tests',
  'token.spec.output.file3': '✅ README.md - Complete documentation',
  'token.spec.output.file4': '✅ manifest.json - Plugin metadata',
  'token.spec.output.file5': '✅ types.gleam - Type definitions',

  // Vibe Coding Section
  'token.vibe.title': 'What is Vibe Coding?',
  'token.vibe.definition':
    "Term coined by Andrej Karpathy (OpenAI, Tesla) in February 2025. Developers fully trust AI to write code, clicking 'Accept All' without reading diffs. Fast but risky: 45% of AI code has security vulnerabilities.",
  'token.vibe.stats.vulnerabilities': 'of AI code contains vulnerabilities',
  'token.vibe.stats.yc': 'of YC startups have 95%+ AI code',
  'token.vibe.stats.snippets.value': '1 in 3',
  'token.vibe.stats.snippets.label': 'AI snippets with vulnerabilities',
  'token.vibe.stats.source.veracode': 'Veracode 2025',
  'token.vibe.stats.source.yc': 'Y Combinator 2025',
  'token.vibe.stats.source.academic': 'Academic Research',
  'token.vibe.flow.without': 'Vibe Coding without VIBEE',
  'token.vibe.flow.with': 'Vibe Coding with VIBEE',
  'token.vibe.flow.acceptAll': '✓ Accept All',
  'token.vibe.flow.securityBugs': '⚠️ Security bugs',
  'token.vibe.flow.productionIncident': '💥 Production incident',
  'token.vibe.flow.specCheck': '🔒 @spec check',
  'token.vibe.flow.safeDeployment': '✅ Safe deployment',
  'token.vibe.conclusion.bold': 'VIBEE is built for this reality.',
  'token.vibe.conclusion.text':
    'Rules are embedded in the language grammar, not in prompts.',

  // Origin Story
  'token.origin.title':
    'I understood the vibe coding problem before the term existed',
  'token.origin.ch1.title': 'Vibe coding = full trust in AI',
  'token.origin.ch1.quote':
    "\"I worked with LLM agents long before the term 'vibe coding'. And every time the same problem: AI ignores the rules you give it. I write 'tests first' — it forgets. Again and again.\"",
  'token.origin.ch1.explanation':
    "Prompts don't work. Context is lost. Rules are bypassed. This is the main problem with vibe coding — no enforcement.",
  'token.origin.ch2.title': '@spec = safety net for vibe coding',
  'token.origin.ch2.quote':
    '"When you click Accept All in Cursor or Claude Code, AI code goes to the VIBEE compiler. No @spec — code won\'t compile. It\'s physically impossible to deploy an untested agent."',
  'token.origin.ch2.before': 'Vibe coding without VIBEE',
  'token.origin.ch2.after': 'Vibe coding with VIBEE',
  'token.origin.ch3.title': 'Accept All safely with decorators',
  'token.origin.ch3.quote':
    '"AI rarely adds retry, timeout, circuit breaker. In VIBEE it\'s one line — a decorator. Accept All and get production-ready code."',
  'token.origin.conclusion':
    'VIBEE is the only DSL where vibe coding becomes safe. Rules in grammar, not in prompts.',

  // Problem Section
  'token.problem.title': 'The vibe coding problem — AI code in production',
  'token.problem.security.title': '45% of AI code has vulnerabilities',
  'token.problem.security.text':
    'SQL Injection, XSS, Command Injection — top LLM errors. Veracode 2025: almost half of AI code is unsafe.',
  'token.problem.hangover.title': 'Vibe coding hangover',
  'token.problem.hangover.text':
    'SaaStr incident: AI agent deleted production database. Without checks, AI can do anything.',
  'token.problem.gap.title': 'Comprehension gap',
  'token.problem.gap.text':
    "Developers don't understand the AI code they deploy. When it breaks — they don't know how to fix it.",

  // Fail Section
  'token.fail.title': "Why current frameworks don't work",
  'token.fail.config.title': 'Config files without guarantees',
  'token.fail.config.text':
    "Chaining libraries don't provide formal behavior guarantees: prompt changes — everything breaks.",
  'token.fail.tests.title': 'Tests are optional',
  'token.fail.tests.text':
    'You can deploy an agent without a single check. No enforced TDD/BDD.',
  'token.fail.payments.title': 'Payments are separate',
  'token.fail.payments.text':
    'Payments and security are always "bolted on" separately, no unified transaction model.',

  // Solution Section
  'token.solution.title': 'Vibe code boldly — @spec catches errors',
  'token.solution.p1.bold': 'VIBEE is a DSL for safe vibe coding.',
  'token.solution.p1.text':
    'When AI generates code, it goes to a compiler that requires @spec for every tool/agent.',
  'token.solution.p2.text':
    'You can click Accept All as much as you want — without a Given–When–Then specification,',
  'token.solution.p2.bold': "the code physically won't compile.",
  'token.solution.p3':
    'The output is a production-ready agent on BEAM VM with 99.9999999% uptime. Even vibe-coded.',

  // Code Comparison
  'token.code.title': 'Vibe code faster with VIBEE',
  'token.code.subtitle':
    'Less code = fewer places for AI errors. 10 lines VIBEE vs 120 lines Java.',
  'token.code.note':
    'VIBEE automatically generates boilerplate, error handling, retry logic and types. Developer writes only business logic.',

  // Compilation
  'token.compilation.title': 'What VIBEE compiles to',
  'token.compilation.subtitle':
    'VIBEE DSL → Gleam → BEAM bytecode. See the transformation.',
  'token.compilation.step1': 'Declarative code',
  'token.compilation.step2': 'Type-safe code for BEAM',
  'token.compilation.step3': 'Erlang bytecode',
  'token.compilation.hotReload': 'Hot code reload',
  'token.compilation.supervision': 'Supervision trees',
  'token.compilation.ets': 'ETS caching',
  'token.compilation.distributed': 'Distributed actors',
  'token.compilation.persistent': 'Persistent state',
  'token.compilation.faultIsolation': 'Fault isolation',
  'token.compilation.note':
    '10 lines of VIBEE become ~30 lines of typed Gleam code with retry, cache, timeout and error handling. Output: fault-tolerant BEAM process.',

  // Syntax Comparison
  'token.syntax.title': '🔬 VIBEE Language Syntax Comparison',
  'token.syntax.subtitle':
    'All 25 syntax features with real code examples - Click tabs to explore',
  'token.syntax.tabs.all': '🌟 All (25)',
  'token.syntax.tabs.core': '🎯 Core (5)',
  'token.syntax.tabs.operators': '⚡ Operators (5)',
  'token.syntax.tabs.patterns': '🎨 Patterns (5)',
  'token.syntax.tabs.advanced': '🚀 Advanced (5)',
  'token.syntax.tabs.types': '📦 Types (5)',

  // Syntax Features Showcase
  'token.syntaxShowcase.badge': '7 Unique Features',
  'token.syntaxShowcase.title.unique': 'Unique VIBEE',
  'token.syntaxShowcase.title.syntax': 'Syntax Features',
  'token.syntaxShowcase.subtitle':
    "Powerful features that exist only in VIBEE - giving you superpowers other languages don't have",

  // All Features List
  'token.allFeatures.title': 'Complete List: All 25 VIBEE Syntax Features',
  'token.allFeatures.subtitle': 'Every feature that makes VIBEE unique',
  'token.allFeatures.core': '🎯 Core Features (5)',
  'token.allFeatures.operators': '⚡ Operators (5)',
  'token.allFeatures.patterns': '🎨 Patterns (5)',
  'token.allFeatures.advanced': '🚀 Advanced (5)',
  'token.allFeatures.types': '📦 Types (5)',

  // 25 Syntax Features
  'token.feature.1.title': '1. Pipe Operator',
  'token.feature.2.title': '2. Pattern Matching with Guards',
  'token.feature.3.title': '3. List Comprehensions',
  'token.feature.4.title': '4. Extension Methods (55+)',
  'token.feature.5.title': '5. Try Operator (Error Handling)',
  'token.feature.6.title': '6. Decorators (52 Built-in)',
  'token.feature.7.title': '7. Smart Constructors',
  'token.feature.8.title': '8. SQL DSL',
  'token.feature.9.title': '9. Operator Sections',
  'token.feature.10.title': '10. With Statement',
  'token.feature.11.title': '11. Destructuring',
  'token.feature.12.title': '12. Optional Chaining',
  'token.feature.13.title': '13. Guard Clauses',
  'token.feature.14.title': '14. Context Managers',
  'token.feature.15.title': '15. Sigils',
  'token.feature.16.title': '16. Range Operator',
  'token.feature.17.title': '17. Elvis Operator',
  'token.feature.18.title': '18. Spread Operator',
  'token.feature.19.title': '19. Type Aliases',
  'token.feature.20.title': '20. Opaque Types',
  'token.feature.21.title': '21. Builder Pattern',
  'token.feature.22.title': '22. JSON Derive',
  'token.feature.23.title': '23. Async/Await',
  'token.feature.24.title': '24. Tap Operator (Debug)',
  'token.feature.25.title': '25. Conditional Pipe (Result)',

  // Unique Features
  'token.uniqueFeature.badge': 'Only in VIBEE',
  'token.uniqueFeature.4pipes.title': '4 Pipe Operators',
  'token.uniqueFeature.4pipes.desc':
    'Most languages have 0-1 pipe operators. VIBEE has 4 specialized variants for different use cases.',
  'token.uniqueFeature.4pipes.standard': 'Standard',
  'token.uniqueFeature.4pipes.tap': 'Tap (Debug)',
  'token.uniqueFeature.4pipes.conditional': 'Conditional',
  'token.uniqueFeature.4pipes.indexed': 'Indexed',
  'token.uniqueFeature.52decorators.title': '52 Built-in Decorators',
  'token.uniqueFeature.52decorators.desc':
    'Most languages have 0-10 decorators. VIBEE has 52 production-ready decorators for AI agents.',
  'token.uniqueFeature.operatorSections.title': 'Operator Sections',
  'token.uniqueFeature.operatorSections.desc':
    'Partial application of operators - write (> 5) instead of fn(x) { x > 5 }',

  // Comparison Table
  'token.comparison.python': 'Python',
  'token.comparison.typescript': 'TypeScript',
  'token.comparison.rust': 'Rust',
  'token.comparison.go': 'Go',
  'token.comparison.gleam': 'Gleam',
  'token.comparison.typeSystem': 'Type System',
  'token.comparison.staticTypes': 'Static Types',
  'token.comparison.typeInference': 'Type Inference',
  'token.comparison.patternMatching': 'Pattern Matching',
  'token.comparison.algebraicTypes': 'Algebraic Types',
  'token.comparison.syntaxFeatures': 'Syntax Features',
  'token.comparison.decorators': 'Decorators',
  'token.comparison.pipeOperator': 'Pipe Operator',
  'token.comparison.tryOperator': 'Try Operator',
  'token.comparison.asyncAwait': 'Async/Await',
  'token.comparison.resilience': 'Resilience & Reliability',
  'token.comparison.builtinRetry': 'Built-in Retry',
  'token.comparison.circuitBreaker': 'Circuit Breaker',
  'token.comparison.timeout': 'Timeout',
  'token.comparison.caching': 'Caching',
  'token.comparison.supervisionTrees': 'Supervision Trees',
  'token.comparison.vectorSearch': 'Vector Search',
  'token.comparison.embeddings': 'Embeddings',
  'token.comparison.platformIntegrations': 'Platform Integrations',
  'token.comparison.telegramBot': 'Telegram Bot',
  'token.comparison.webhooks': 'Webhooks',
  'token.comparison.validationTesting': 'Validation & Testing',
  'token.comparison.runtimeValidation': 'Runtime Validation',
  'token.comparison.specTesting': 'Spec Testing',
  'token.comparison.propertyTesting': 'Property Testing',
  'token.comparison.performance': 'Performance',
  'token.comparison.compilation': 'Compilation',
  'token.comparison.hotReload': 'Hot Reload',
  'token.comparison.concurrency': 'Concurrency',
  'token.comparison.memorySafety': 'Memory Safety',
  'token.comparison.developerExperience': 'Developer Experience',
  'token.comparison.learningCurve': 'Learning Curve',
  'token.comparison.errorMessages': 'Error Messages',
  'token.comparison.tooling': 'Tooling',
  'token.comparison.productionReady': 'Production Ready',
  'token.comparison.faultTolerance': 'Fault Tolerance',
  'token.comparison.distributed': 'Distributed',
  'token.comparison.observability': 'Observability',
  'token.comparison.battleTested': 'Battle Tested',
  'token.comparison.fullSupport': 'Full Support / Excellent',
  'token.comparison.partialSupport': 'Partial Support / Limited',
  'token.comparison.summary': 'Summary',

  // Decorators
  'token.decorators.title': 'Accept All safely with decorators',
  'token.decorators.subtitle':
    "AI rarely adds retry, timeout, circuit breaker. In VIBEE — it's one line. 12 decorators, 6,500+ usages.",
  'token.decorators.tabs.all': 'All',
  'token.decorators.tabs.core': 'Core',
  'token.decorators.tabs.resilience': 'Resilience',
  'token.decorators.tabs.types': 'Types',
  'token.decorators.tabs.integrations': 'Integrations',
  'token.decorators.spec.usage': '3,462 usages',
  'token.decorators.spec.desc':
    "TDD-first: code won't compile without specification (Given-When-Then)",
  'token.decorators.impl.usage': '1,484 usages',
  'token.decorators.impl.desc':
    'Implementation marker after @spec. Links specification to code.',
  'token.decorators.retry.usage': '188 usages',
  'token.decorators.retry.desc':
    'Automatic retries with exponential/linear/constant backoff',
  'token.decorators.timeout.usage': '170 usages',
  'token.decorators.timeout.desc':
    'Execution time limit. Protection from hanging calls.',
  'token.decorators.circuit.usage': '138 usages',
  'token.decorators.circuit.desc':
    '"Circuit breaker" pattern — protection from cascade failures',
  'token.decorators.cache.usage': '158 usages',
  'token.decorators.cache.desc':
    'ETS caching with TTL. Instant access to hot data.',
  'token.decorators.builder.usage': '403 usages',
  'token.decorators.builder.desc':
    'Builder pattern + automatic to_json() method',
  'token.decorators.derive.usage': '231 usages',
  'token.decorators.derive.desc':
    'Automatic JSON serialization/deserialization',
  'token.decorators.enum.usage': '137 usages',
  'token.decorators.enum.desc': 'Auto to_string() / from_string() for enums',
  'token.decorators.crud.usage': '64 usages',
  'token.decorators.crud.desc': 'Automatic CRUD operations for DB entities',
  'token.decorators.llm.usage': '200+ usages',
  'token.decorators.llm.desc':
    'LLM provider connection. Support for 19+ models.',
  'token.decorators.telegram.usage': '150+ usages',
  'token.decorators.telegram.desc':
    'Telegram MTProto integration. Bot API and UserBot modes.',
  'token.decorators.http.usage': '80+ usages',
  'token.decorators.http.desc':
    'Declarative HTTP requests. REST API in one line.',
  'token.decorators.paywall.usage': '50+ usages',
  'token.decorators.paywall.desc':
    'Payment gateway before action. Crypto + fiat + Telegram Stars.',
  'token.decorators.fullExampleTitle':
    'Full example: Escrow agent for marketplace',

  // Demo
  'token.demo.title': 'Example: marketplace agent in 15 minutes',
  'token.demo.intro':
    'Imagine a digital services marketplace. Sellers and buyers talk to an agent: it helps find a performer, agree on price, lock money in escrow and automatically pay after task completion.',
  'token.demo.step1.title': 'Describe logic in DSL',
  'token.demo.step1.text': 'Specifications + scenarios',
  'token.demo.step2.title': 'Compile',
  'token.demo.step2.text': 'Tests pass → agent ready',
  'token.demo.step3.title': 'Deploy to BEAM',
  'token.demo.step3.text': '99.9999999% uptime',
  'token.demo.step4.title': 'Connect payments',
  'token.demo.step4.text': 'Crypto + fiat + escrow',
  'token.demo.result':
    'Developer gets not a "chatbot" but an industrial component ready for production.',

  // Features
  'token.features.title': 'Product — what VIBEE consists of',
  'token.features.dsl.title': 'VIBEE DSL',
  'token.features.dsl':
    'Language for describing agent logic and constraints with mandatory specifications.',
  'token.features.beam.title': 'BEAM Runtime',
  'token.features.beam':
    'Cluster with auto-recovery, millions of lightweight processes and 99.9999999% uptime.',
  'token.features.mcp.title': 'MCP Native',
  'token.features.mcp':
    'Deep integrations with Claude, Cursor and developer tools.',
  'token.features.payments.title': 'Payments Layer',
  'token.features.payments':
    'Crypto, fiat, P2P escrow — managed by agent according to set rules.',
  'token.features.devex.title': 'Dev Experience',
  'token.features.devex':
    'CLI, SDK, one-command deploy, CI/CD and test runner integrations.',
  'token.features.rainbow.title': 'Rainbow Bridge',
  'token.features.rainbow':
    'E2E tests on real Telegram accounts. Not mocks — live checks.',

  // ICP
  'token.icp.title': "Who we're building VIBEE for",
  'token.icp.saas.badge': 'B2B SaaS',
  'token.icp.saas':
    'Companies that want to embed agents in their product (support, sales, ops) with controlled behavior.',
  'token.icp.fintech.badge': 'Fintech & Marketplaces',
  'token.icp.fintech.text':
    'Platforms with transactions where agent must manage money by strict rules.',
  'token.icp.agencies.badge': 'Studios & Agencies',
  'token.icp.agencies.text':
    'Teams building custom AI agents for clients who want an industrial stack.',

  // Moat
  'token.moat.title': 'Why this is hard to replicate',
  'token.moat.dsl.title': 'Only compiled DSL for AI agents on BEAM',
  'token.moat.dsl.text':
    'Competitors are libraries and configs, not languages.',
  'token.moat.tdd.title': 'Enforced TDD/BDD',
  'token.moat.tdd.text':
    'Specification and test requirements are built into the architecture before compilation.',
  'token.moat.payments.title': 'Native payments and escrow layer',
  'token.moat.payments.text':
    'Not just "connect Stripe" but a unified money model in DSL.',
  'token.moat.templates.title': 'Accumulation of domain templates',
  'token.moat.templates.text':
    'Over time VIBEE accumulates ready "agents by industry", strengthening moat.',

  // Business
  'token.business.title': 'How VIBEE makes money',
  'token.business.saas.title': 'Subscription (SaaS)',
  'token.business.saas.text':
    'Plans by number of agents, integrations, transactions and environment (dev/prod).',
  'token.business.month': 'mo',
  'token.business.usage.title': 'Usage-based',
  'token.business.usage.text':
    'Small commission on payments and escrow operations passing through agents.',
  'token.business.enterprise.title': 'Enterprise',
  'token.business.enterprise.text':
    'On-prem/private clusters, SLA, consulting and custom integrations.',
  'token.business.custom': 'Custom',

  // Traction
  'token.traction.title': 'Where we are now',
  'token.traction.loc': 'LOC in codebase',
  'token.traction.mcp': 'MCP tools',
  'token.traction.ai': 'AI integrations',
  'token.traction.payments': 'Payment partners',
  'token.traction.scenes': 'Ready bot scenes',

  // Market
  'token.market.title': 'Market and timing',
  'token.market.p1':
    'AI agents market is growing at ~46% CAGR, with total volume estimated at $69 billion by 2034.',
  'token.market.p2':
    'Investors are shifting from "bare LLMs" to infrastructure and devtools that enable reliable products on top of models.',
  'token.market.vc': 'AI share in VC',

  // Competitors
  'token.competitors.title': 'Detailed competitor comparison',
  'token.competitors.subtitle': '8 leading AI Agent frameworks of 2025',
  'token.competitors.feature': 'Feature',
  'token.competitors.vibeSafe': 'Vibe Coding Safe',
  'token.competitors.specEnforced': '@spec enforced',
  'token.competitors.compileTime': 'Compile-time Checks',
  'token.competitors.typeSafety': 'Type Safety',
  'token.competitors.enforcedTests': 'Enforced Tests',
  'token.competitors.required': 'Required',
  'token.competitors.optional': 'Optional',
  'token.competitors.runtime': 'Runtime',
  'token.competitors.dynamic': 'Dynamic',
  'token.competitors.language': 'Language',
  'token.competitors.vmRuntime': 'VM / Runtime',
  'token.competitors.uptimeSla': 'Uptime SLA',
  'token.competitors.hotReload': 'Hot Code Reload',
  'token.competitors.dsl': 'DSL',
  'token.competitors.compiled': 'Compiled',
  'token.competitors.none': 'None',
  'token.competitors.minimal': 'Minimal',
  'token.competitors.config': 'Config',
  'token.competitors.pipeline': 'Pipeline',
  'token.competitors.visual': 'Visual',
  'token.competitors.multiAgent': 'Multi-Agent',
  'token.competitors.visualBuilder': 'Visual Builder',
  'token.competitors.ragSupport': 'RAG Support',
  'token.competitors.limited': 'Limited',
  'token.competitors.best': 'Best',
  'token.competitors.builtinPayments': 'Built-in Payments',
  'token.competitors.partners': '9 partners + escrow',
  'token.competitors.crypto': 'Crypto',
  'token.competitors.web3': 'Web3 / Blockchain',
  'token.competitors.full': 'Full',
  'token.competitors.telegramNative': 'Telegram Native',
  'token.competitors.mtproto': 'MTProto',
  'token.competitors.botApi': 'Bot API',
  'token.competitors.safetyReliability': 'Safety & Reliability',
  'token.competitors.runtimePerformance': 'Runtime & Performance',
  'token.competitors.featuresCategory': 'Features',
  'token.competitors.integration': 'Integration',
  'token.competitors.langchainDesc':
    'Most popular LLM framework. Great ecosystem, but no compile-time safety.',
  'token.competitors.autogenDesc':
    'Multi-agent conversations. Strong Azure integration, but Python runtime.',
  'token.competitors.crewaiDesc':
    'Role-based multi-agent. Simple API, but only sequential workflows.',
  'token.competitors.elizaosDesc':
    'Web3-first agents. Full blockchain integration, but no enforced tests.',
  'token.competitors.haystackDesc':
    'Best for RAG and search. Pipeline-based, but limited multi-agent support.',
  'token.competitors.difyDesc':
    'Visual builder for AI apps. No-code approach, but no type safety.',
  'token.competitors.conclusion':
    'VIBEE is the only framework with compile-time safety for vibe coding. @spec enforcement + BEAM runtime = production-ready agents without fear.',

  // Roadmap
  'token.roadmap.title': 'Roadmap',
  'token.roadmap.q1.date': '0–6 months',
  'token.roadmap.q1.title': 'Public release',
  'token.roadmap.q1.text':
    'DSL, documentation, first agent templates, 2–3 pilots.',
  'token.roadmap.q2.date': '6–12 months',
  'token.roadmap.q2.title': 'Billing and marketplace',
  'token.roadmap.q2.text': 'Usage-based, template marketplace, active devrel.',
  'token.roadmap.q3.date': '12–24 months',
  'token.roadmap.q3.title': 'Enterprise and partnerships',
  'token.roadmap.q3.text':
    'Reach MRR, enterprise cases, partnerships with payment and AI platforms.',

  // Team
  'token.team.title': 'Team',
  'token.team.founder.name': 'Dmitry Vasiliev',
  'token.team.founder.bio':
    'Engineer and consultant in AI agents, devtools and digital clones. Experience building AI services, content marketing automation and DSL-based development approaches.',
  'token.team.hiring':
    'Planning to strengthen with expertise in fintech payments, enterprise sales and open-source community development.',

  // Ask
  'token.ask.title': 'Ask',
  'token.ask.use.title': 'Use of funds:',
  'token.ask.use.item1': 'VIBEE DSL core and BEAM infrastructure development',
  'token.ask.use.item2': 'Product packaging (CLI, SDK, documentation)',
  'token.ask.use.item3': 'B2B pilot program',
  'token.ask.use.item4':
    'Team strengthening (fintech, devrel, enterprise sales)',
  'token.ask.goal':
    'Round goal — reach sustainable MRR and 2–3 reference cases with real transactions within 18–24 months.',

  // CTA
  'token.cta.title': 'Contact us',
  'token.cta.subtitle': "Let's discuss a pilot, investment or partnership.",
  'token.cta.telegram': 'Telegram',
  'token.cta.twitter': 'X / Twitter',
  'token.cta.email': 'Email',

  // Footer
  'token.footer.back': '← Back to Home',
}

const ru: Translations = {
  // cyrillic-ok: UI dictionary, Russian half
  'crm.title': 'CRM',
  'crm.refresh': 'Обновить',
  'crm.refreshing': 'Обновляю…',
  'crm.unreachable': 'Не удалось загрузить',
  'crm.waiting.title': 'Ждут ответа',
  'crm.waiting.none':
    'Никто не ждёт ответа. Это хорошая новость, а не пустой экран.',
  'crm.waiting.counts':
    'ждут нас: {ours} · пора вернуться: {due} · ждём ответа: {theirs}',
  'crm.leads.title': 'Горячие лиды',
  'crm.leads.counts': 'найдено {found}',
  'crm.leads.setAside': 'отложено недавно тронутых: {n}',
  'crm.leads.quiet': 'молчит {days} дн',
  'crm.audience.title': 'Аудитория',
  'crm.audience.total': 'всего',
  'crm.audience.paying': 'платят',
  'crm.audience.came7': 'за 7 дней',
  'crm.audience.came30': 'за 30 дней',
  'crm.act.written': 'Написал',
  'crm.act.replied': 'Ответил',
  'crm.act.refused': 'Отказался',
  'crm.act.later': 'Просил позже',
  'crm.act.bought': 'Купил',
  'crm.act.note': 'Заметка',
  'crm.note':
    'Кнопки записывают, что уже произошло, — они ничего никому не отправляют. Отправка подтверждается по одному сообщению в чате бота.',
  'crm.stage.client': 'клиент',
  'crm.stage.refused': 'отказался',
  'crm.stage.later': 'просил позже',
  'crm.stage.talking': 'разговариваем',
  'crm.stage.written': 'написали',
  'crm.stage.winback': 'вернуть',
  'crm.stage.new': 'новый',
  'crm.wait.ours': 'ждёт НАС',
  'crm.wait.theirs': 'ждём ответа',
  'crm.wait.due': 'пора вернуться',
  // ── CRM: client list and per-client workspace ────────────────────────────
  'crm.clients.title': 'Клиенты',
  'crm.clients.none': 'Пока нет клиентов с профилем или перепиской.',
  'crm.clients.profile': 'профиль',
  'crm.clients.soul': 'SOUL',
  'crm.clients.duets': 'дуэтов: {n}',
  'crm.clients.paid': 'оплатил',
  'crm.clients.paidUnknown': 'платежи недоступны — стадия только по касаниям',
  'crm.clients.filter.all': 'все',
  'crm.clients.filter.clients': 'клиенты',
  'crm.clients.filter.leads': 'лиды',
  'crm.client.title': 'Клиент {id}',
  'crm.client.back': 'CRM',
  'crm.client.chatButton': 'Чат по клиенту',
  'crm.client.unreachable': 'недоступно',
  'crm.client.empty': 'пока пусто',
  'crm.client.profile.title': 'Профиль / SOUL / скилы',
  'crm.client.profile.profile': 'профиль',
  'crm.client.profile.soul': 'SOUL',
  'crm.client.profile.skills': 'скилы',
  'crm.client.profile.updated': 'обновлён',
  'crm.client.plan.title': 'Контент-план',
  'crm.client.plan.progress': 'готово {done} из {total}',
  'crm.client.plan.goal': 'цель',
  'crm.client.duets.title': 'Дуэты',
  'crm.client.duets.none': 'прогонов ещё нет',
  'crm.client.duets.paid': 'платных вызовов',
  'crm.client.duets.media': 'медиа отправлено',
  'crm.client.duets.turns': 'ходов',
  'crm.client.duets.violations': 'нарушений',
  'crm.client.duets.voice': 'голосовых флагов',
  'crm.client.duets.coverage': 'покрытие',
  'crm.client.duets.dry': 'сухой прогон',
  'crm.client.duets.start': 'Запустить дуэт',
  'crm.client.duets.starting': 'Запускаю…',
  'crm.client.duets.confirm':
    'Сухой прогон выключен: агент отправит НАСТОЯЩИЕ сообщения этому клиенту в Telegram. Всё равно запустить?',
  'crm.client.duets.confirmYes': 'Да, отправлять по-настоящему',
  'crm.client.duets.confirmNo': 'Отмена',
  'crm.client.duets.started': 'дуэт {id} запущен · {state}',
  'crm.client.duets.notStarted': 'не запущен',
  'crm.client.duets.error': 'не удалось запустить',
  'crm.client.duets.lines': 'реплик',
  'crm.client.duets.state.done': 'завершён',
  'crm.client.duets.state.running': 'идёт',
  'crm.client.duets.state.failed': 'упал',
  'crm.client.duets.state.lost': 'потерян',
  'crm.client.touches.title': 'Касания и стадия',
  'crm.client.touches.stage': 'стадия',
  'crm.client.touches.none': 'касаний не записано',
  'crm.client.media.title': 'Медиа',
  'crm.client.media.none': 'файлами не обменивались',
  'crm.client.media.ours': 'наше',
  'crm.client.media.theirs': 'его',
  'crm.client.messages.title': 'Последние сообщения',
  'crm.client.messages.none': 'сообщений пока нет',
  'crm.client.messages.waitingOnUs': 'ждёт нас',
  'crm.client.messages.us': 'мы',
  'crm.client.messages.them': 'клиент',
  'crm.client.chat.title': 'Разговор о клиенте {id}',
  'crm.client.chat.back': 'К клиенту',
  'crm.client.chat.welcome':
    'Это разговор о клиенте {id}. Я уже держу его профиль, план и последние сообщения — спроси, что делать дальше.',

  // cyrillic-ok: UI dictionary, Russian half
  'connect.title': 'Подключить Telegram',
  'connect.lead':
    'Ассистент работает с вашей перепиской: читает её, готовит ответы и отправляет только то, что вы подтвердили.',
  'connect.can.read': 'Читает ваши диалоги, контакты и историю сообщений.',
  'connect.can.write': 'Пишет кому-либо только после вашего подтверждения.',
  'connect.can.secret':
    'Код и пароль двухфакторной защиты не сохраняются — они уходят в Telegram.',
  'connect.can.phone':
    'Номер сохраняется, чтобы не вводить его снова; при отключении удаляется.',
  'connect.can.off': 'Отключить можно здесь же, в одно нажатие.',
  'connect.step': 'Шаг {n} из {total}',
  'connect.back': 'Назад',
  'connect.phone.title': 'Ваш номер телефона',
  'connect.phone.hint': 'Тот, на который зарегистрирован ваш Telegram.',
  'connect.phone.fromTelegram': 'Номер из Telegram — можно исправить',
  'connect.phone.go': 'Получить код',
  'connect.phone.going': 'Отправляю код…',
  'connect.code.title': 'Введите код',
  'connect.code.viaApp':
    'Telegram прислал код сообщением — ищите чат «Telegram»',
  'connect.code.viaSms': 'Код отправлен вам по SMS',
  'connect.code.to': 'на {phone}',
  'connect.code.change': 'Изменить номер',
  'connect.code.label': 'Код из Telegram',
  'connect.code.warn': 'Не пересылайте этот код никому, включая нас.',
  'connect.code.go': 'Подтвердить',
  'connect.code.going': 'Проверяю…',
  'connect.code.resend': 'Запросить новый код',
  'connect.code.resendIn': 'Новый код можно запросить через {sec} с',
  'connect.pass.title': 'Пароль двухфакторной защиты',
  'connect.pass.hint':
    'У вас включена двухфакторная защита. Пароль не сохраняется.',
  'connect.pass.label': 'Пароль',
  'connect.pass.go': 'Войти',
  'connect.pass.going': 'Проверяю…',
  'connect.done.title': 'Telegram подключён',
  'connect.done.body':
    'Ассистент видит ваши диалоги и контакты и может искать по переписке. Он ничего не отправляет от вашего имени без вашего подтверждения.',
  'connect.done.off': 'Отключить',

  // Header
  'nav.features': 'Возможности',
  'nav.pricing': 'Цены',
  'nav.docs': 'Документация',
  'nav.getStarted': 'Начать',

  // Hero
  'hero.badge': 'Агентный вайбрилс',
  'hero.title': 'Рилсы делает твой агент',
  'hero.subtitle':
    'Подключи любого агента по MCP — он читает твою ленту, файлы и шаблоны и публикует рилсы за тебя. Или просто поговори со встроенным. Ты задаёшь вайб — агент делает работу.',
  'cta.try': 'Попробовать',
  'cta.demo': 'Смотреть демо',
  'cta.createReel': 'Создать первый рилс',
  'hero.stat.creators': 'Креаторов',
  'hero.stat.reels': 'Рилсов создано',
  'hero.stat.minUnit': 'мин',
  'hero.stat.avgTime': 'Среднее время создания',
  'hero.stat.views': 'Просмотров',
  'hero.video.createdWith': 'Создано в VIBEE',
  'hero.trust.label': 'Делись на любимых платформах',

  // Feed Preview
  'feedPreview.badge': 'Сообщество',
  'feedPreview.title': 'Смотри ленту креаторов',
  'feedPreview.subtitle':
    'Смотри, лайкай и вдохновляйся лучшими рилсами нашего сообщества',
  'feedPreview.cta': 'Смотреть ленту',

  // Features
  'features.badge': 'Платформа',
  'features.title': 'Всё для создания рилс',
  'features.subtitle': 'От идеи до вирусного видео в несколько кликов',
  'features.reels.title': 'AI Рилс Создатель',
  'features.reels.desc':
    'Опиши идею — получи сценарий, видео и озвучку за 2 минуты',
  'features.feed.title': 'Лента креаторов',
  'features.feed.desc':
    'Смотри, лайкай и вдохновляйся лучшими рилсами сообщества',
  'features.avatars.title': 'Говорящие аватары',
  'features.avatars.desc':
    'Создай цифрового двойника, который говорит твоим голосом',
  'features.analytics.title': 'Аналитика',
  'features.analytics.desc':
    'Отслеживай охваты, вовлечённость и рост аудитории',

  // Creator Showcase
  'creatorShowcase.badge': 'Креаторы',
  'creatorShowcase.title': 'Присоединяйся к топ-креаторам',
  'creatorShowcase.subtitle': 'Тысячи креаторов уже зарабатывают с VIBEE',
  'creatorShowcase.followers': 'Подписчики',
  'creatorShowcase.reels': 'Рилсы',
  'creatorShowcase.quote1':
    'VIBEE изменил мой контент. Теперь я делаю 5 рилсов в день!',
  'creatorShowcase.quote2':
    'AI-аватары просто невероятные. Моя аудитория в восторге.',
  'creatorShowcase.quote3':
    'Наконец инструмент, который делает профессиональное видео доступным всем.',

  // Testimonials
  'testimonials.badge': 'Отзывы',
  'testimonials.title': 'Что говорят пользователи',
  'testimonials.subtitle': 'Реальные отзывы от настоящих креаторов',
  'testimonials.role1': 'Контент-креатор',
  'testimonials.role2': 'Маркетинг-менеджер',
  'testimonials.role3': 'Блогер',
  'testimonials.role4': 'SMM-специалист',
  'testimonials.quote1':
    'Раньше я тратила часы на монтаж. Теперь создаю рилс за 2 минуты. Это меняет всё!',
  'testimonials.quote2':
    'Продуктивность нашей команды выросла втрое. VIBEE экономит время и бюджет.',
  'testimonials.quote3':
    'AI-аватары выглядят так реалистично! Мои подписчики не могут отличить.',
  'testimonials.quote4':
    'Простой интерфейс, мощный результат. Рекомендую всем, кто создаёт контент.',

  // Integrations
  'integrations.title': 'На базе лучших AI',
  'integrations.subtitle':
    'Интеграция с лучшими AI сервисами на одной платформе',

  // How it Works
  'howItWorks.badge': 'Просто',
  'howItWorks.title': 'Как это работает',
  'howItWorks.subtitle': 'От идеи до готового рилса за 3 простых шага',
  'howItWorks.step1.title': 'Опиши идею',
  'howItWorks.step1.desc': 'Расскажи, что хочешь создать. AI напишет сценарий.',
  'howItWorks.step2.title': 'Выбери стиль',
  'howItWorks.step2.desc':
    'Подбери аватар, голос, музыку и визуальный стиль рилса.',
  'howItWorks.step3.title': 'Публикуй',
  'howItWorks.step3.desc':
    'Делись в Instagram, TikTok, YouTube или ленте VIBEE.',

  // Pricing
  'pricing.badge': 'Цены',
  'pricing.title': 'Плати за то, что сделал',
  'pricing.subtitle':
    'Никаких тарифов и подписок: пополняешь баланс токенами и тратишь его',
  'pricing.pro.popular': 'Популярный',
  'pricing.pack.name': '{n} токенов',
  'pricing.pack.period': 'звёздами Telegram',
  'pricing.pack.cta': 'Пополнить',
  'pricing.tokens.feature1': 'Картинки, озвучка, видео, сборка рилса',
  'pricing.tokens.feature2': 'Один баланс на всё, без мест и участников',
  'pricing.tokens.feature3': 'Цена каждого действия видна до нажатия',
  'pricing.tokens.feature4': 'Токены не сгорают и не списываются ежемесячно',
  'pricing.tokens.note':
    'Первые токены — при входе, без карты. Счёт на любое количество выпишет агент в боте.',

  // Errors
  'errors.title': 'Что-то пошло не так',
  'errors.subtitle': 'Произошла непредвиденная ошибка',
  'errors.tryAgain': 'Попробовать снова',
  'errors.reload': 'Перезагрузить страницу',
  'errors.clearAndReload': 'Очистить данные и перезагрузить',
  'errors.showDetails': 'Показать детали ошибки',
  'errors.support': 'Если проблема сохраняется, обратитесь в поддержку',
  'error.panel_crashed': 'Ошибка панели',
  'error.panel_desc':
    'Эта панель столкнулась с ошибкой. Попробуйте перезагрузить.',
  'error.retry': 'Повторить',

  // Accessibility
  'a11y.skipToContent': 'Перейти к основному содержимому',

  // Newsletter
  'newsletter.title': 'Будьте в курсе',
  'newsletter.subtitle':
    'Получайте советы по созданию видео с ИИ и обновления продукта',
  'newsletter.placeholder': 'Введите email',
  'newsletter.subscribe': 'Подписаться',
  'newsletter.success': 'Спасибо за подписку!',
  'newsletter.error': 'Ошибка подписки. Попробуйте ещё раз.',
  'newsletter.invalidEmail': 'Введите корректный email адрес',

  // Footer
  'footer.tagline': 'Соцсеть для создания рилсов с AI',
  'footer.product': 'Продукт',
  'footer.features': 'Возможности',
  'footer.pricing': 'Цены',
  'footer.feed': 'Лента',
  'footer.company': 'Компания',
  'footer.about': 'О нас',
  'footer.blog': 'Блог',
  'footer.careers': 'Карьера',
  'footer.support': 'Поддержка',
  'footer.docs': 'Документация',
  'footer.help': 'Центр помощи',
  'footer.contact': 'Контакты',
  'footer.legal': 'Правовая информация',
  'footer.privacy': 'Политика конфиденциальности',
  'footer.terms': 'Условия использования',
  'footer.rights': 'Все права защищены.',

  // Editor Header
  'editor.export': 'Экспорт',
  'editor.exporting': 'Рендеринг...',
  'editor.settings': 'Настройки',
  'editor.save': 'Сохранить проект',
  'editor.saveTemplate': 'Сохранить как шаблон',
  'editor.load': 'Загрузить проект',
  'editor.reset': 'Сбросить настройки',
  'editor.undo': 'Отменить',
  'editor.redo': 'Повторить',
  'editor.projectName': 'Название проекта',
  'editor.history': 'История',
  'editor.fileOps': 'Операции с файлами',

  // Settings Modal
  'settings.title': 'Настройки',
  'settings.export': 'Экспорт',
  'settings.codec': 'Кодек',
  'settings.quality': 'Качество',
  'settings.shortcuts': 'Горячие клавиши',
  'settings.project': 'Проект',
  'settings.name': 'Название',
  'settings.resolution': 'Разрешение',
  'settings.fps': 'FPS',
  'settings.duration': 'Длительность',
  'settings.connections': 'Соцсети',
  'settings.notConnected': 'Не подключено',
  'settings.connect': 'Подключить',
  'settings.disconnect': 'Отключить',

  // Dialogs
  'dialog.reset.title': 'Сбросить настройки?',
  'dialog.reset.text':
    'Все изменения будут потеряны. Таймлайн, ассеты и настройки будут восстановлены к исходному состоянию.',
  'dialog.reset.warning': 'Это действие нельзя отменить.',
  'dialog.cancel': 'Отмена',
  'dialog.reset': 'Сбросить',
  'dialog.exportAnyway': 'Экспортировать',

  // Blob Warning
  'blob.title': 'Обнаружены локальные файлы',
  'blob.text':
    'Следующие файлы хранятся локально и будут пропущены при экспорте:',
  'blob.hint':
    'Чтобы включить эти файлы, удалите их и загрузите заново. Они будут сохранены в облаке.',
  'blob.criticalTitle': 'Невозможно экспортировать',
  'blob.criticalText':
    'Следующие обязательные файлы хранятся локально и недоступны серверу рендеринга:',
  'blob.criticalHint':
    'Сначала загрузите lipsync видео в облако. Откройте панель Assets, удалите локальный файл и загрузите его заново.',
  'dialog.ok': 'OK',

  // Login Modal
  'login.title': 'Войдите для экспорта',
  'login.tgSignedTitle': 'Вы уже вошли',
  'login.tgSignedBody':
    'Telegram уже определил вас — отдельного входа внутри мини-аппа не существует.',
  'login.tgContinue': 'Продолжить',
  'templates.canons': 'Шаблоны сервера',
  'templates.noneOnServer': 'На сервере пока нет шаблонов, готовых к рендеру.',
  'common.close': 'Закрыть',
  'login.tgUnsignedTitle': 'Откройте приложение кнопкой меню',
  'login.tgUnsignedBody':
    'Этот запуск не несёт подписанных данных, и сервер не может подтвердить, кто вы. Откройте приложение через кнопку меню бота или инлайн-кнопку — и всё заработает.',
  'login.subtitle': 'Войдите через Telegram и получите 3 бесплатных рендера!',
  'login.returnToGame': 'Войдите через Telegram, чтобы вернуться в игру.',
  'embed.guest.title': 'Войдите, чтобы пользоваться этим от своего имени',
  'embed.guest.body':
    'Сейчас вы здесь гость. Войдите через Telegram на app.t27.ai, и вы вернётесь на этот экран.',
  'embed.guest.signIn': 'Войти через Telegram',
  'login.button': 'Войти',
  'login.buttonFull': 'Войти через Telegram',

  // Quota
  'quota.unlimited': 'Безлимит',
  'quota.left': 'осталось',
  'quota.free': 'бесплатно',

  // Properties Panel
  'props.properties': 'Свойства',
  'props.batchEdit': 'Групповое редактирование',
  'props.items': 'элементов',
  'props.adjustDuration': 'Изменить длительность',
  'props.makeSameDuration': 'Сделать одинаковыми',
  'props.setsAllToShortest': 'Установить минимальную',
  'props.selectionInfo': 'Информация о выборке',
  'props.content': 'Контент',
  'props.style': 'Стиль',
  'props.fontSize': 'Размер шрифта',
  'props.color': 'Цвет',
  'props.weight': 'Насыщенность',
  'props.align': 'Выравнивание',
  'props.left': 'Слева',
  'props.center': 'По центру',
  'props.right': 'Справа',
  'props.position': 'Позиция',
  'props.opacity': 'Прозрачность',
  'props.timing': 'Тайминг',
  'props.start': 'Начало',
  'props.duration': 'Длительность',
  'props.media': 'Медиа',
  'props.lipsyncVideo': 'Lipsync видео',
  'props.coverImage': 'Обложка',
  'props.backgroundMusic': 'Фоновая музыка',
  'props.effects': 'Эффекты',
  'props.musicVolume': 'Громкость музыки',
  'props.coverDuration': 'Длительность обложки',
  'props.vignette': 'Виньетка',
  'props.colorCorrection': 'Цветокоррекция',
  'props.avatarCircle': 'Круг аватара',
  'props.size': 'Размер',
  'props.bottom': 'Снизу',
  'props.backgrounds': 'Фоны',
  'props.videos': 'видео',
  'props.dragVideosHint': 'Перетащите видео на дорожку Video для смены фона',
  'props.enterText': 'Введите текст...',

  // Duration adjustment buttons
  'props.minus1s': '-1 секунда',
  'props.minus05s': '-0.5 секунды',
  'props.plus05s': '+0.5 секунды',
  'props.plus1s': '+1 секунда',
  'props.pathPlaceholder': '/путь/к/файлу',

  // Section headers
  'section.text': 'Текст',
  'section.style': 'Стиль',
  'section.position': 'Позиция',
  'section.timing': 'Тайминг',
  'section.layout': 'Макет',
  'section.media': 'Медиа',
  'section.effects': 'Эффекты',
  'section.avatar': 'Круг аватара',
  'section.backgrounds': 'Фоны',
  'section.audio': 'Аудио',

  // Properties - Volume
  'props.volume': 'Громкость',

  // Font weights
  'font.light': 'Тонкий',
  'font.regular': 'Обычный',
  'font.medium': 'Средний',
  'font.semibold': 'Полужирный',
  'font.bold': 'Жирный',
  'font.extrabold': 'Сверхжирный',

  // TrackItem
  'track.clickToAdjustVolume': 'Нажмите для настройки громкости',

  // Auth
  'auth.logout': 'Выйти',
  'auth.logoutAll': 'Выйти на всех устройствах, включая это',
  'auth.logoutAllShort': 'Выйти везде',

  // Captions preview
  'captions.previewText': 'Привет',

  // Layers Panel
  'layers.addText': 'Добавить текст',
  'layers.hideTrack': 'Скрыть дорожку',
  'layers.showTrack': 'Показать дорожку',
  'layers.lockTrack': 'Заблокировать дорожку',
  'layers.unlockTrack': 'Разблокировать дорожку',
  'layers.selected': 'выбрано',
  'layers.delete': 'Удалить',

  // Captions Panel
  'captions.title': 'Субтитры',
  'captions.style': 'Стиль',
  'captions.hide': 'Скрыть субтитры',
  'captions.show': 'Показать субтитры',
  'captions.addAt': 'Добавить в',
  'captions.add': 'Добавить',
  'captions.uploadHint': 'Загрузить .srt или .vtt файл',
  'captions.import': 'Импорт',
  'captions.transcribeHint': 'Авто-транскрибация русской речи через Whisper',
  'captions.transcribing': 'Транскрибация...',
  'captions.transcribe': 'Транскрибировать',
  'captions.empty': 'Нет субтитров',
  'captions.emptyHint': 'Добавьте вручную или импортируйте .srt/.vtt файл',
  'captions.text': 'Текст',
  'captions.fontSize': 'Размер шрифта',
  'captions.fontWeight': 'Насыщенность',
  'captions.font': 'Шрифт',
  'captions.cyrillic': 'Кириллица',
  'captions.searchFonts': 'Поиск шрифтов...',
  'captions.popular': 'Популярные',
  'captions.allFonts': 'Все шрифты',
  'captions.noFonts': 'Шрифты не найдены',
  'captions.colors': 'Цвета',
  'captions.textColor': 'Цвет текста',
  'captions.highlight': 'Подсветка',
  'captions.background': 'Фон',
  'captions.position': 'Позиция',
  'captions.bottomPercent': 'Отступ снизу %',
  'captions.maxWidth': 'Макс. ширина %',
  'captions.effects': 'Эффекты',
  'captions.textShadow': 'Тень текста',
  'captions.animation': 'Анимация',
  'captions.current': 'Текущий',
  'captions.noVideoLoaded':
    'Видео не загружено. Сначала добавьте lipsync видео.',
  'captions.noVideo': 'Видео не загружено. Сначала добавьте lip-sync видео.',
  'captions.transcriptionFailed': 'Ошибка транскрипции:',
  'captions.parseError':
    'Не удалось разобрать субтитры. Проверьте формат файла.',

  // Assets Panel
  'assets.dropOrClick': 'Перетащите файлы или нажмите для загрузки',
  'assets.uploadsToCloud': 'Загрузка в облако S3',
  'assets.uploading': 'Загрузка...',
  'assets.done': 'Готово',
  'assets.error': 'Ошибка',
  'assets.videos': 'Видео',
  'assets.images': 'Изображения',
  'assets.audio': 'Аудио',
  'assets.localWarning':
    'Локальный файл - будет пропущен при экспорте!\nПерезагрузите для исправления.',
  'assets.doubleClickHint': 'Двойной клик или перетащите на таймлайн',
  'assets.localNoExport': 'Локальный файл - не экспортируется',
  'assets.noVideos': 'Пока нет видео',
  'assets.noImages': 'Пока нет изображений',
  'assets.noAudio': 'Пока нет аудио файлов',
  'assets.noVoice': 'Голосовые файлы появятся здесь после AI генерации',
  'assets.noMusic': 'Пока нет музыки. Загрузите или сгенерируйте музыку.',

  // Chat Panel
  'chat.offlineMessage':
    'Я сейчас офлайн. AI сервер подключится автоматически, когда будет доступен. Пока можете изучить настройки шаблона в левой панели.',
  'chat.applied': 'Применено:',
  'chat.failedToApply': 'Ошибка применения:',
  'chat.unknownError': 'Неизвестная ошибка',
  'chat.agent': 'VIBEE Агент',
  'chat.connected': 'Подключен',
  'chat.offline': 'Офлайн',
  'chat.clearChat': 'Очистить чат',
  'chat.chat': 'Чат',
  'chat.logs': 'Логи',
  'chat.capturedLogs': 'логов',
  'chat.templateProps': 'свойств шаблона',
  'chat.errors': 'ошибок',
  'chat.placeholder': 'Опишите, что хотите создать...',
  // Поле ввода 240px — длинная подсказка обрезалась на «или за…».
  // Короткая читается целиком, а про файлы человек узнаёт из кнопки рядом.
  'chat.messagePlaceholder': 'Сообщение агенту…',
  'chat.send': 'Отправить',
  'chat.welcome':
    'Привет! Я VIBEE AI ассистент. Могу помочь создать и отредактировать видео шаблоны. Что хотите сделать?',
  'chat.cleared': 'Чат очищен. Чем могу помочь?',

  // Templates Panel
  'templates.title': 'Шаблоны',
  'templates.pageSubtitle': 'Ваши сохранённые шаблоны и пресеты',
  'templates.saveTitle': 'Сохранить как шаблон',
  'templates.saveDescription':
    'Сохранить текущие настройки со всеми ассетами как шаблон.',
  'templates.namePlaceholder': 'Название шаблона',
  'templates.save': 'Сохранить',
  'templates.delete': 'Удалить шаблон',
  'templates.confirmDelete': 'Вы уверены, что хотите удалить этот шаблон?',

  // Timeline
  'timeline.skipToStart': 'В начало',
  'timeline.pause': 'Пауза',
  'timeline.play': 'Воспроизвести',
  'timeline.skipToEnd': 'В конец',
  'timeline.slower': 'Медленнее',
  'timeline.faster': 'Быстрее',
  'timeline.unmute': 'Включить звук',
  'timeline.mute': 'Выключить звук',
  'timeline.volume': 'Громкость',
  'timeline.snapToGrid': 'Привязка к сетке',
  'timeline.on': 'ВКЛ',
  'timeline.off': 'ВЫКЛ',
  'timeline.zoomOut': 'Уменьшить',
  'timeline.zoomIn': 'Увеличить',
  'timeline.fitToView': 'По размеру окна',
  'timeline.title': 'Таймлайн',
  'timeline.controls': 'Управление воспроизведением',
  'timeline.speed': 'Скорость воспроизведения',
  'timeline.zoom': 'Масштаб таймлайна',
  'timeline.currentTime': 'Текущее время',
  'timeline.in': 'Вход',
  'timeline.out': 'Выход',
  'timeline.assetNotCompatible': 'Тип файла несовместим с дорожкой',
  'timeline.solo': 'Соло дорожки',
  'timeline.unsolo': 'Отменить соло',
  'timeline.reorderTrack': 'Перетащите для перемещения',

  // Volume Popup
  'volume.musicVolume': 'Громкость музыки',
  'volume.avatarVolume': 'Громкость аватара',
  'volume.videoVolume': 'Громкость видео',
  'volume.mute': 'Без звука',
  'volume.clickToAdjust': 'Нажмите для настройки громкости',

  // Canvas
  'canvas.fullscreenNotSupported':
    'Полноэкранный режим не поддерживается или заблокирован',
  'canvas.exitFullscreen': 'Выйти из полноэкранного режима',
  'canvas.fullscreen': 'Полноэкранный режим',
  'canvas.transcribingAudio': 'Транскрибация аудио...',
  'canvas.loadingCaptions': 'Загрузка субтитров...',
  'canvas.dropToAdd': 'Перетащите сюда',

  // Paywall
  'paywall.junior': 'JUNIOR',
  'paywall.middle': 'MIDDLE',
  'paywall.senior': 'SENIOR',
  'paywall.rendersMonth': 'рендеров/месяц',
  'paywall.hdQuality': 'HD качество',
  'paywall.4kQuality': '4K качество',
  'paywall.emailSupport': 'Email поддержка',
  'paywall.prioritySupport': 'Приоритетная поддержка',
  'paywall.premiumSupport': 'Премиум поддержка',
  'paywall.customFonts': 'Кастомные шрифты',
  'paywall.apiAccess': 'API доступ',
  'paywall.unlimitedRenders': 'Безлимитные рендеры',
  'paywall.card': 'Карта',
  'paywall.stars': 'Stars',
  'paywall.ton': 'TON',
  'paywall.freeUsedUp': 'Бесплатные рендеры закончились!',
  'paywall.subscribeMessage':
    'Вы использовали все бесплатные рендеры. Подпишитесь, чтобы продолжить создавать видео.',
  'paywall.mostPopular': 'Популярный',
  'paywall.perMonth': '/месяц',
  'paywall.securePayments':
    'Все платежи безопасны и обрабатываются через Telegram',

  // Auth
  'auth.login': 'Войти',
  'auth.signInTelegram': 'Войти через Telegram',

  // Context Menu
  'menu.copy': 'Копировать',
  'menu.paste': 'Вставить',
  'menu.duplicate': 'Дублировать',
  'menu.color': 'Цвет',
  'menu.delete': 'Удалить',
  'menu.noColor': 'Без цвета',
  'color.red': 'Красный',
  'color.orange': 'Оранжевый',
  'color.yellow': 'Жёлтый',
  'color.green': 'Зелёный',
  'color.blue': 'Синий',
  'color.purple': 'Фиолетовый',
  'color.pink': 'Розовый',

  // Header Alerts
  'editor.invalidFormat': 'Неверный формат файла проекта',
  'editor.importSuccess': 'Проект успешно импортирован!',
  'editor.importFailed': 'Ошибка импорта. Неверный формат JSON.',
  'editor.exportFailed': 'Ошибка экспорта',
  'editor.connectionLost': 'Потеряно соединение с сервером рендеринга',
  'editor.unknownError': 'Неизвестная ошибка',

  // Tab Tooltips
  'tabs.feed': 'Лента',
  'tabs.blog': 'Блог',
  'tabs.search': 'Поиск',
  'tabs.profile': 'Профиль',
  'tabs.script': 'Сценарий',
  'tabs.templates': 'Шаблоны',
  'tabs.assets': 'Ассеты',
  'tabs.player': 'Плеер',
  'tabs.editor': 'Редактор',
  'tabs.ai': 'ИИ',
  'tabs.avatar': 'Липсинк',
  'tabs.layers': 'Слои',
  'tabs.properties': 'Свойства',
  'tabs.captions': 'Субтитры',

  // Feed
  'feed.title': 'Лента сообщества',
  'feed.recent': 'Новые',
  'feed.popular': 'Популярные',
  'feed.refresh': 'Обновить',
  'feed.loading': 'Загрузка...',
  'feed.empty': 'Пока нет шаблонов',
  'feed.loadMore': 'Загрузить ещё',
  'feed.retry': 'Повторить',
  'feed.useTemplate': 'Использовать',
  'feed.using': 'Загрузка...',
  'feed.like': 'Нравится',
  'feed.star': 'Отправить звезду автору — на его баланс',
  'feed.today': 'Сегодня',
  'feed.yesterday': 'Вчера',
  'feed.remixing': 'Загрузка шаблона...',
  'feed.remixHint': 'Запишите свой голос и камео, чтобы сделать видео своим!',
  'feed.for_you': 'Для вас',
  'feed.following': 'Подписки',
  'feed.justNow': 'Только что',
  // Единицы намеренно БЕЗ точки: «36 мин», «3 ч», «1 д». Точка после
  // сокращения в плотной подписи ленты читается как конец предложения.
  //
  // Ведущий пробел — часть строки, а не кода: по-русски «36 мин» пишется
  // раздельно, по-английски «36m» слитно. Отдельный ключ-разделитель был бы
  // невидимкой, о которую спотыкается следующий переводчик.
  'feed.ageMin': ' мин',
  'feed.ageHour': ' ч',
  'feed.ageDay': ' д',
  'feed.ageWeek': ' нед',
  'feed.ageMonth': ' мес',
  'feed.remix': 'Ремикс',
  'feed.remixBasedOn': 'Сделано на основе другого шаблона',
  'app.title': 'Trinity S³AI — рилсы на автопилоте',
  'feed.videoError': 'Не удалось загрузить видео',
  'feed.deleteConfirm': 'Удалить это видео?',

  // Publish Modal
  'publish.title': 'Поделиться в ленте',
  'publish.subtitle': 'Опубликуйте своё творение в ленте сообщества',
  'publish.name': 'Название',
  'publish.namePlaceholder': 'Введите название видео',
  'publish.nameRequired': 'Введите название',
  'publish.description': 'Описание',
  'publish.descPlaceholder': 'Расскажите о своём творении...',
  'publish.share': 'Опубликовать',
  'publish.publishing': 'Публикация...',
  'publish.success': 'Опубликовано!',
  'publish.successDesc': 'Ваше творение теперь в ленте сообщества',
  'publish.failed': 'Не удалось опубликовать. Попробуйте ещё раз.',
  'publish.noVideo': 'Нет видео для публикации',
  'publish.remixOf': 'Ремикс',
  'publish.postToTelegram': 'Также опубликовать в Telegram',
  'publish.postToInstagram': 'Также опубликовать в Instagram',
  'publish.connectInstagram': 'Подключить Instagram',
  'publish.instagramUnavailable':
    'Публикация в Instagram пока не настроена на сервере',
  'publish.captionPreview': 'Превью поста',

  // Instagram callback
  'instagram.connecting': 'Подключение Instagram...',
  'instagram.success': 'Instagram успешно подключён!',
  'instagram.successMessage': 'Теперь вы можете публиковать видео в Instagram.',
  'instagram.done': 'Готово!',
  'instagram.openingShare': 'Открываю окно публикации...',
  'instagram.failed': 'Ошибка подключения',
  'instagram.missingCode': 'Отсутствует код авторизации',
  'instagram.networkError': 'Ошибка сети. Попробуйте ещё раз.',
  'instagram.backToEditor': 'Вернуться в редактор',
  'publish.generateAI': 'AI Caption',
  'publish.captionPlaceholder': 'Напишите текст поста...',
  'publish.resetCaption': 'Сбросить',

  // Notifications
  'notifications.title': 'Уведомления',
  'notifications.all': 'Все',
  'notifications.unread': 'Непрочитанные',
  'notifications.empty': 'Пока нет уведомлений',
  'notifications.mark_read': 'Отметить прочитанным',
  'notifications.mark_all_read': 'Прочитать все',
  'notifications.clear_all': 'Очистить все уведомления',
  'notifications.liked_video': 'понравилось ваше видео',
  'notifications.commented': 'прокомментировал ваше видео',
  'notifications.followed': 'подписался на вас',
  'notifications.mentioned': 'упомянул вас',
  'notifications.video_ready': 'Ваше видео готово',

  // Stories
  'stories.your_story': 'Ваша история',
  'stories.add': 'Добавить историю',

  // Messages
  'messages.title': 'Сообщения',
  'messages.search': 'Поиск сообщений...',
  'messages.empty': 'Пока нет сообщений',
  'messages.placeholder': 'Сообщение...',

  // Analytics
  'analytics.title': 'Аналитика',
  'analytics.overview': 'Обзор',
  'analytics.content': 'Контент',
  'analytics.audience': 'Аудитория',
  'analytics.last7days': 'Последние 7 дней',
  'analytics.last30days': 'Последние 30 дней',
  'analytics.last90days': 'Последние 90 дней',
  'analytics.allTime': 'За всё время',
  'analytics.views': 'Просмотры',
  'analytics.likes': 'Лайки',
  'analytics.comments': 'Комментарии',
  'analytics.followers': 'Подписчики',
  'analytics.videos': 'видео',
  'analytics.avgWatch': 'среднее время',
  'analytics.shares': 'репостов',
  'analytics.viewsOverTime': 'Просмотры по времени',
  'analytics.topVideos': 'Топ видео',
  'analytics.ageDistribution': 'Возраст аудитории',
  'analytics.topCountries': 'Топ стран',

  // Sound
  'sound.original': 'Оригинальный звук',
  'sound.use': 'Использовать',
  'sound.useThis': 'Использовать этот звук',
  'sound.save': 'Сохранить',
  'sound.saved': 'Сохранено',
  'sound.videos': 'видео',
  'sound.originalSound': 'Оригинальный звук',

  // Remix Badge
  'remix.badge': 'Ремикс',
  'remix.of': 'Ремикс',
  'remix.by': 'от',
  'remix.original': 'Оригинал от',

  // Player
  'player.pause': 'Пауза',
  'player.play': 'Воспроизвести',

  // Player Panel Settings
  'player.music': 'Музыка',
  'player.musicVolume': 'Громкость',
  'player.effects': 'Эффекты',
  'player.vignette': 'Виньетка',
  'player.colorCorrection': 'Цвет',
  'player.avatar': 'Аватар',
  'player.autoDetect': 'Авто-лицо',
  'player.detect': 'Найти',
  'player.detecting': 'Поиск...',
  'player.circle': 'Круг',
  'player.borderRadius': 'Радиус',
  'player.avatarSize': 'Размер',
  'player.positionX': 'Позиция X',
  'player.positionY': 'Позиция Y',
  'player.faceScale': 'Масштаб лица',
  'player.captions': 'Субтитры',
  'player.showCaptions': 'Показать',
  'player.playback': 'Воспроизведение',
  'player.playbackSpeed': 'Скорость',
  'player.split': 'Сплит',
  'player.fullscreen': 'На весь экран',
  'player.reset': 'Сбросить',
  'player.animation': 'Анимация',
  'player.avatarEffect': 'Эффект аватара',
  'player.none': 'Без эффекта',

  // Border Effect
  'player.borderEffect': 'Эффект обводки',
  'player.effectType': 'Тип эффекта',
  'player.solid': 'Сплошная',
  'player.neon': 'Неон',
  'player.rainbow': 'Радуга',
  'player.glass': 'Стекло',
  'player.gradient': 'Градиент',
  'player.pulse': 'Пульс',
  'player.glow': 'Мягкое свечение',
  'player.double': 'Двойная',
  'player.neonPulse': 'Неон + Пульс',
  'player.fire': 'Огонь',
  'player.ocean': 'Океан',
  'player.sunset': 'Закат',
  'player.electric': 'Электро',
  'player.holographic': 'Голография',
  'player.borderColor': 'Цвет обводки',
  'player.borderColor2': 'Цвет 2',
  'player.borderWidth': 'Ширина обводки',
  'player.borderIntensity': 'Интенсивность',

  // WebSocket
  'ws.syncActive': 'Синхронизация активна',
  'ws.connecting': 'Подключение к серверу синхронизации...',

  // Codec Options
  'codec.h264': 'H.264 (MP4) - Лучшая совместимость',
  'codec.h265': 'H.265 (HEVC) - Меньший размер',
  'codec.vp9': 'VP9 (WebM) - Для веба',
  'codec.prores': 'ProRes - Профессиональный',

  // Quality Options
  'quality.high': 'Высокое (1080p)',
  'quality.medium': 'Среднее (720p)',
  'quality.low': 'Низкое (480p)',

  // Keyboard Shortcuts
  'shortcuts.title': 'Горячие клавиши',
  'shortcuts.playback': 'Воспроизведение',
  'shortcuts.editing': 'Редактирование',
  'shortcuts.selection': 'Выделение',
  'shortcuts.navigation': 'Навигация',
  'shortcuts.view': 'Вид',
  'shortcut.playPause': 'Плей / Пауза',
  'shortcut.rewind1s': 'Назад на 1 секунду',
  'shortcut.pause': 'Пауза',
  'shortcut.forward1s': 'Вперёд на 1 секунду',
  'shortcut.prevFrame': 'Предыдущий кадр',
  'shortcut.nextFrame': 'Следующий кадр',
  'shortcut.back1Frame': 'Назад на 1 кадр',
  'shortcut.forward1Frame': 'Вперёд на 1 кадр',
  'shortcut.back10Frames': 'Назад на 10 кадров',
  'shortcut.forward10Frames': 'Вперёд на 10 кадров',
  'shortcut.goToStart': 'Перейти в начало',
  'shortcut.goToEnd': 'Перейти в конец',
  'shortcut.jkl': '-1с / Пауза / +1с',
  'shortcut.undo': 'Отменить',
  'shortcut.redo': 'Повторить',
  'shortcut.selectAll': 'Выделить всё',
  'shortcut.copy': 'Копировать',
  'shortcut.paste': 'Вставить',
  'shortcut.duplicate': 'Дублировать',
  'shortcut.delete': 'Удалить',
  'shortcut.deleteWithGap': 'Удалить с закрытием gap',
  'shortcut.splitAtPlayhead': 'Разрезать на playhead',
  'shortcut.clearSelection': 'Снять выделение',
  'shortcut.addToSelection': 'Добавить к выделению',
  'shortcut.selectRange': 'Выделить диапазон',
  'shortcut.toSelectionStart': 'К началу выделения',
  'shortcut.toSelectionEnd': 'К концу выделения',
  'shortcut.setInPoint': 'Установить In point',
  'shortcut.setOutPoint': 'Установить Out point',
  'shortcut.resetInOut': 'Сбросить In/Out points',
  'shortcut.toggleMarker': 'Добавить/удалить маркер',
  'shortcut.nextMarker': 'К следующему маркеру',
  'shortcut.prevMarker': 'К предыдущему маркеру',
  'shortcut.move1Frame': 'Сдвиг на 1 кадр',
  'shortcut.move10Frames': 'Сдвиг на 10 кадров',
  'shortcut.goToStartEnd': 'В начало / конец',
  'shortcut.zoomInOut': 'Увеличить / Уменьшить',
  'shortcut.fitTimeline': 'Вместить в окно',
  'shortcut.showShortcuts': 'Показать горячие клавиши',

  // Canvas
  'canvas.zoomOut': 'Уменьшить',
  'canvas.zoomIn': 'Увеличить',

  // Loading
  'loading.editor': 'Загрузка редактора...',

  // Layers - additional
  'layers.newText': 'Новый текст',

  // Generate Panel
  'generate.title': 'Генерация',
  'generate.image': 'Фото',
  'generate.video': 'Видео',
  'generate.audio': 'Голос',
  'generate.lipsync': 'Липсинк',
  'generate.model': 'Модель',
  'generate.prompt': 'Промпт',
  'generate.promptPlaceholder': 'Опишите, что хотите сгенерировать...',
  'generate.videoPromptPlaceholder': 'Опишите видео сцену...',
  'generate.textPlaceholder': 'Введите текст для озвучки...',
  'generate.aspectRatio': 'Соотношение',
  'generate.duration': 'Длительность',
  'generate.resolution': 'Разрешение',
  'generate.voice': 'Голос',
  'generate.music': 'Музыка',
  'generate.text': 'Текст',
  'generate.speed': 'Скорость',
  'generate.audioUrl': 'URL аудио',
  'generate.imageUrl': 'URL картинки',
  'generate.generating': 'Генерация...',
  'generate.generateImage': 'Сгенерировать фото',
  'generate.generateVideo': 'Сгенерировать видео',
  'generate.generateAudio': 'Сгенерировать аудио',
  'generate.generateLipsync': 'Сгенерировать липсинк',
  'generate.error': 'Ошибка генерации. Попробуйте еще раз.',
  'tabs.generate': 'Генерация',
  'generate.audioSource': 'Голосовое аудио',
  'generate.uploadAudio': 'Загрузить',
  'generate.recordAudio': 'Записать',
  'generate.saveRecording': 'Сохранить',
  'generate.imageSource': 'Фото аватара',
  'generate.uploadImage': 'Загрузить фото',
  'generate.myPhotos': 'Мои фото — одно фото, весь контент',
  'generate.myPhotosEmpty':
    'Сохранённых фото пока нет: загрузите одно и сохраните — липсинк будет брать лицо отсюда',
  'generate.saveToAvatar': 'Сохранить фото в аватар',
  'generate.savedToAvatar': 'Сохранено',
  'generate.results': 'Результаты',
  'generate.dragHint': 'Перетащите на таймлайн',
  'generate.addToTimeline': 'Добавить на таймлайн',
  'generate.remove': 'Удалить',

  // Results Gallery
  'results.noImages': 'Изображения ещё не сгенерированы',
  'results.noVideos': 'Видео ещё не сгенерированы',
  'results.noAudio': 'Аудио ещё не сгенерировано',
  'results.noLipsync': 'Липсинк видео ещё не сгенерированы',

  // Comments
  'comments.title': 'Комментарии',
  'comments.empty': 'Пока нет комментариев',
  'comments.be_first': 'Будьте первым!',
  'comments.placeholder': 'Добавить комментарий...',
  'comments.reply': 'Ответить',
  'comments.replying_to': 'Ответ для',
  'comments.delete': 'Удалить',

  // Panels
  'panels.properties': 'Свойства',

  // Profile
  'profile.edit': 'Редактировать',
  'profile.edit_template': 'Редактировать',
  'profile.delete_template': 'Удалить',
  'profile.preview_template': 'Воспроизвести',
  'profile.pause_preview': 'Пауза',
  'profile.delete_template_confirm': 'Удалить шаблон из профиля?',
  'profile.template_action_failed':
    'Не удалось изменить шаблон. Войдите и попробуйте ещё раз.',
  'profile.edit_cover': 'Изменить обложку',
  'profile.followers': 'Подписчики',
  'profile.following': 'Подписки',
  'profile.videos': 'Видео',
  'profile.views': 'Просмотры',
  'profile.likes': 'Лайки',
  'profile.templates': 'Шаблоны',
  'profile.follow': 'Подписаться',
  'profile.following_btn': 'Подписан',
  'profile.unfollow': 'Отписаться',
  'profile.no_followers': 'Пока нет подписчиков',
  'profile.no_followers_desc':
    'Поделитесь профилем, чтобы получить подписчиков',
  'profile.no_following': 'Нет подписок',
  'profile.no_following_desc': 'Найдите интересных авторов',
  'profile.no_templates': 'Пока нет видео',
  'profile.no_templates_desc': 'Создайте своё первое AI-видео',
  'profile.create_first_video': 'Создать видео',
  'profile.load_more': 'Загрузить ещё',
  'profile.loading': 'Загрузка профиля...',
  'profile.not_found': 'Пользователь не найден',
  'soul.title': 'Мой SOUL — агент пишет моим голосом',
  'soul.hint':
    'Эту карточку агент читает перед каждым ответом: посты пишутся твоим голосом, а не средним. Редактируй здесь — или просто попроси агента в чате («добавь в мой SOUL…»).',
  'soul.save': 'Сохранить',
  'soul.saved': 'Сохранено',
  'soul.fillTemplate': 'Заполнить шаблон',
  'soul.skillsTitle': 'Скиллы агента (9)',
  'soul.skillsHint':
    'Всё, что агент умеет прямо сейчас — тот же список, которым он пользуется сам. Скиллы soul_ редактируют ТВОЙ SOUL.',
  'soul.skill.whoami': 'кто ты в приложении',
  'soul.skill.feed_stats': 'сводка ленты: авторы, ролики, просмотры, лайки',
  'soul.skill.feed_list': 'последние ролики (свои или публичные)',
  'soul.skill.feed_get': 'один ролик целиком со слоями — для ремикса',
  'soul.skill.templates_list': 'шаблоны рилсов из бандла рендера',
  'soul.skill.my_assets': 'твои файлы: фото, видео, озвучка',
  'soul.skill.feed_publish': 'опубликовать ролик (нужен текст с хештегами)',
  'soul.skill.soul_get': 'прочитать твой SOUL',
  'soul.skill.soul_edit': 'править твой SOUL по просьбе — как скилл',
  'profile.not_found_desc': 'Этот профиль не существует или был удалён',
  'profile.gate.title': 'Подключите Telegram, чтобы открыть профиль',
  'profile.gate.body':
    'Агент пишет и читает от вашего имени, поэтому ему нужен ваш Telegram, вход по номеру телефона. Один раз; отключить можно потом во вкладке «Агент».',
  // ── Welcome road on the profile (value -> club -> Telegram -> SOUL) ──────
  'welcome.step': 'Шаг {n} из {total}',
  'welcome.next': 'Дальше',
  'welcome.value.title':
    'Цифровой двойник, который ведёт твой Telegram за тебя',
  'welcome.value.lead':
    'Не чат-бот в одном окне. Агент, который говорит твоим голосом, держит ленту живой и знает, что ты продаёшь.',
  'welcome.value.dm':
    'Отвечает в личке и группах от твоего имени, помнит разговор, не теряет клиента',
  'welcome.value.reels':
    'Делает рилсы, картинки и озвучку в твоём стиле — не стоковые, твои',
  'welcome.value.plan':
    'Ведёт контент-план и публикует по расписанию, пока ты работаешь',
  'welcome.value.blog':
    'Пишет блог и читает аналитику, чтобы следующий пост был лучше прошлого',
  'welcome.value.note':
    'Цифры охватов и дохода не обещаем: их даёт твой контент и твоя аудитория. Обещаем время, которое к тебе вернётся.',
  'welcome.how.title': 'Как это устроено',
  'welcome.how.lead': 'Три части. Каждая — твоя, каждую можно выключить.',
  'welcome.how.soul':
    'SOUL.md — кто ты, что продаёшь, как звучишь, что запрещено. На нём строится двойник.',
  'welcome.how.telegram':
    'Твой Telegram, вход по номеру — чтобы двойник писал как ты, а не как бот.',
  'welcome.how.tokens':
    'Токены на балансе — каждый ответ, картинка, озвучка и рилс списываются с него; текст дешевле всего, видео дороже всего.',
  'welcome.how.note':
    'Каждое списание видно в чате. Скрытых платежей нет, тарифов кроме клуба и пакетов токенов нет.',
  'welcome.club.title': 'Вход в клуб',
  'welcome.club.lead':
    'Один платёж звёздами Telegram открывает двойника. Часть сразу возвращается тебе токенами.',
  'welcome.club.per': 'за {days} дней',
  'welcome.club.tokens':
    '{tokens} токенов приходят на баланс с каждого платежа',
  'welcome.club.share': '(30% от платежа)',
  'welcome.club.badge': 'Клуб',
  'welcome.club.renew':
    'Продление внутри Telegram каждые 30 дней — без карт и форм',
  'welcome.club.topup':
    'Токены кончились раньше? Пополни обычным пакетом в чате',
  'welcome.club.cancel':
    'Отменить можно всегда: Telegram → Настройки → Мои звёзды → подписки',
  'welcome.club.loading': 'Спрашиваю цену у сервера…',
  'welcome.club.retry': 'Спросить цену ещё раз',
  'welcome.club.join': 'Вступить за {stars} звёзд',
  'welcome.club.going': 'Открываю счёт…',
  'welcome.club.pending':
    'Telegram сказал «оплачено», но в реестре платёж ещё не виден. Он зачислится сам в течение часа — вернись, и дорога продолжится.',
  'welcome.club.unsupported':
    'Счёт в звёздах открывается только внутри Telegram. Открой эту страницу из мини-аппа.',
  'welcome.club.cancelled': 'Счёт закрыт без оплаты. Ничего не списано.',
  'welcome.club.failed':
    'Telegram не смог провести платёж. Ничего не списано; попробуй ещё раз.',
  'welcome.connect.title': 'Теперь войди по номеру телефона',
  'welcome.connect.body':
    'Двойнику нужен твой собственный Telegram, чтобы писать как ты. Один раз; отключить можно потом.',
  'welcome.connect.who':
    'Кто: только ты, владелец этого профиля, на этом устройстве.',
  'welcome.connect.what':
    'Что: сессия Telegram от твоего имени — номер, код из Telegram, облачный пароль, если он есть.',
  'welcome.connect.why':
    'Зачем: чтобы двойник отвечал в твоей личке и группах и публиковал в твои каналы.',
  'welcome.connect.howlong':
    'Срок: пока не отключишь. Сессия хранится в зашифрованном виде; код и пароль вводишь только ты, мы их не сохраняем.',
  'welcome.connect.off':
    'Как отключить: вкладка «Агент» → Отключить, или Telegram → Устройства → завершить сеанс.',
  'welcome.connect.warn':
    'Telegram пришлёт уведомление о новом входе. Это и есть подключение — не чужой.',
  'welcome.soul.title': 'Напиши свой SOUL.md',
  'welcome.soul.lead':
    'Четыре коротких ответа. На них строится двойник — полный файл можно править потом во вкладке SOUL.',
  'welcome.soul.who': 'Кто ты',
  'welcome.soul.who.hint': 'Одной строкой: чем занимаешься и за что тебя знают',
  'welcome.soul.sell': 'Что продаёшь',
  'welcome.soul.sell.hint':
    'Услуга, продукт, партнёрки — ради чего твой контент',
  'welcome.soul.voice': 'Твой голос',
  'welcome.soul.voice.hint': 'Как звучать: «просто, по-дружески, без жаргона»',
  'welcome.soul.forbidden': 'Что запрещено',
  'welcome.soul.forbidden.hint':
    'Чего двойник не должен писать никогда: темы, слова, обещания',
  'welcome.soul.save': 'Сохранить и продолжить',
  'welcome.soul.saving': 'Сохраняю…',
  'welcome.done.title': 'Двойник готов',
  'welcome.done.body':
    'Клуб, Telegram и SOUL на месте. Дальше работает агент, а ты рулишь.',
  'welcome.done.first':
    'Напиши агенту в чате — попроси первый рилс, план на неделю или ответ клиенту.',
  'welcome.done.soul':
    'Во вкладке SOUL лежит полный файл; двойник перечитывает его при каждом изменении.',
  'welcome.done.go': 'Открыть мой профиль',
  'welcome.done.play': 'В улей',
  'profile.edit_profile': 'Редактировать профиль',
  'profile.display_name': 'Отображаемое имя',
  'profile.display_name_placeholder': 'Ваше имя',
  'profile.bio': 'О себе',
  'profile.bio_placeholder': 'Расскажите о себе...',
  'profile.social_links': 'Социальные сети',
  'profile.add_link': 'Добавить ссылку',
  'profile.public_profile': 'Публичный профиль',
  'profile.public_profile_hint':
    'Когда выключено, только вы видите свой профиль',
  'profile.viewProfile': 'Открыть профиль',
  'profile.save_error': 'Не удалось сохранить профиль. Попробуйте ещё раз.',

  // Common
  'common.back': 'Назад',
  'common.save': 'Сохранить',
  'common.saving': 'Сохранение...',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  'common.go_home': 'На главную',
  'common.undo': 'Отменить',

  // Timeline Add Actions
  'timeline.addedTo': 'Добавлено на {track}',
  'timeline.addToStart': 'В начало',
  'timeline.addToEnd': 'В конец',
  'timeline.addAtPlayhead': 'На playhead',
  'timeline.replaceSelected': 'Заменить выбранное',

  // Assets Batch Mode
  'assets.selectMode': 'Режим выбора',
  'assets.addAll': 'Добавить все',
  'assets.selected': 'выбрано',
  'assets.clearSelection': 'Очистить',

  // Bottom Navigation
  'nav.feed': 'Лента',
  'nav.search': 'Поиск',
  'nav.create': 'Редактор',
  'nav.profile': 'Профиль',
  'nav.learn': 'Обучение',
  'nav.agent': 'Агент',
  'nav.hive': 'Улей',
  'hive.loading': 'Открываем улей на t27.ai…',
  'hive.frameTitle': 'Улей — t27.ai/#/queen',
  'hive.openOutside': 'Открыть в браузере: t27.ai/#/queen ↗',
  'hive.insideGame':
    'Вы уже внутри игры: улей — это страница вокруг этого фрейма.',
  // Sign-in inside the game's TRI frame on t27.ai (LoginModal).
  'embed.signInTitle': 'Вход — в самом приложении',
  'embed.signInBody':
    'Telegram не пускает свой вход внутрь чужого сайта, а вход, сделанный в приложении, сюда не переносится. Откройте этот экран в приложении, чтобы работать под своим именем.',
  'embed.openApp': 'Открыть этот экран в приложении ↗',
  'nav.editor': 'Редактор',
  'nav.generate': 'Генерация',
  'nav.templates': 'Шаблоны',

  // Search Page
  'search.placeholder': 'Поиск пользователей, шаблонов...',
  'search.no_results': 'Ничего не найдено',
  'search.trending': 'Популярное',
  'search.discover': 'Найти авторов',
  'search.discover_hint': 'Ищите авторов и шаблоны',

  // Quick Actions (Long Press Menu)
  'quickActions.addToTimeline': 'На таймлайн',
  'quickActions.addToStart': 'В начало',
  'quickActions.preview': 'Превью',
  'quickActions.setAsBackground': 'Как фон',
  'quickActions.delete': 'Удалить',

  // Search
  'search.all': 'Все',

  // Canvas Controls
  'canvas.grid': 'Сетка',
  'canvas.safeZone': 'Безопасная зона',
  'canvas.resetZoom': 'Сбросить зум',

  // Toast Messages
  'toast.addedToTimeline': 'Добавлено на таймлайн',
  'toast.removedFromTimeline': 'Удалено с таймлайна',
  'toast.copied': 'Скопировано',
  'toast.assetUploaded': 'Файл загружен',
  'toast.uploadFailed': 'Ошибка загрузки',
  'toast.undo': 'Отменить',

  // Collections
  'assets.collections': 'Коллекции',
  'assets.newCollection': 'Новая коллекция',
  'assets.allAssets': 'Все ассеты',
  'assets.collectionName': 'Название коллекции...',
  'assets.noCollections': 'Пока нет коллекций',
  'assets.createFirst': 'Создайте первую коллекцию',
  'assets.addToCollection': 'Добавить в коллекцию',
  'actions.rename': 'Переименовать',
  'actions.delete': 'Удалить',
  'actions.clearAll': 'Очистить всё',

  // Recent & Favorites
  'assets.recent': 'Недавние',
  'assets.favorites': 'Избранное',
  'assets.noRecent': 'Нет недавних ассетов',
  'assets.noFavorites': 'Нет избранного',

  // Time
  'time.justNow': 'Только что',
  'time.minAgo': ' мин',
  'time.hourAgo': ' ч',
  'time.dayAgo': ' д',

  // Empty States
  'empty.feed.title': 'Пока нет видео',
  'empty.feed.description': 'Будьте первым, кто поделится чем-то классным!',
  'empty.feed.action': 'Исследовать',
  'empty.search.title': 'Поиск видео',
  'empty.search.description': 'Находите авторов, шаблоны и звуки',
  'empty.search.noResults': 'Ничего не найдено',
  'empty.search.tryDifferent': 'Попробуйте другие ключевые слова',
  'empty.messages.title': 'Нет сообщений',
  'empty.messages.description': 'Начните разговор с кем-нибудь',
  'empty.messages.action': 'Начать чат',
  'empty.notifications.title': 'Нет уведомлений',
  'empty.notifications.description': 'Вы в курсе всех событий!',
  'empty.likes.title': 'Нет лайков',
  'empty.likes.description': 'Видео, которые вам понравились, появятся здесь',
  'empty.bookmarks.title': 'Нет сохранённых видео',
  'empty.bookmarks.description': 'Сохраняйте видео для просмотра позже',
  'empty.bookmarks.action': 'Исследовать',
  'empty.followers.title': 'Пока нет подписчиков',
  'empty.followers.description': 'Делитесь видео, чтобы получить подписчиков',
  'empty.following.title': 'Вы ни на кого не подписаны',
  'empty.following.description': 'Найдите интересных авторов',
  'empty.following.action': 'Найти',
  'empty.drafts.title': 'Нет черновиков',
  'empty.drafts.description': 'Незаконченные видео появятся здесь',
  'empty.drafts.action': 'Создать видео',
  'empty.assets.title': 'Нет ассетов',
  'empty.assets.description': 'Загрузите изображения, видео или аудио',
  'empty.assets.action': 'Загрузить',
  'empty.trending.title': 'Нет трендов',
  'empty.trending.description': 'Загляните позже за трендовым контентом',
  'empty.sounds.title': 'Нет сохранённых звуков',
  'empty.sounds.description': 'Сохраняйте звуки для использования в видео',
  'empty.sounds.action': 'Обзор звуков',
  'empty.archive.title': 'Архив пуст',
  'empty.archive.description': 'Архивированный контент появится здесь',
  'empty.history.title': 'Нет истории просмотров',
  'empty.history.description': 'Просмотренные видео появятся здесь',

  // Onboarding
  'onboarding.welcome.title': 'Добро пожаловать в VIBEE',
  'onboarding.welcome.description': 'Создавайте потрясающие AI-видео за минуты',
  'onboarding.create.title': 'Создавайте с AI',
  'onboarding.create.description':
    'Генерируйте видео, изображения и липсинк-аватары',
  'onboarding.discover.title': 'Открывайте контент',
  'onboarding.discover.description': 'Исследуйте трендовые видео и авторов',
  'onboarding.share.title': 'Делитесь и растите',
  'onboarding.share.description': 'Показывайте свои работы всему миру',
  'onboarding.community.title': 'Присоединяйтесь к сообществу',
  'onboarding.community.description': 'Общайтесь с другими авторами',
  'onboarding.back': 'Назад',
  'onboarding.next': 'Далее',
  'onboarding.getStarted': 'Начать',
  'onboarding.skip': 'Пропустить',

  // ===============================
  // Token Page (Investor Pitch)
  // ===============================

  // Header
  'token.nav.home': 'Главная',
  'token.nav.editor': 'Редактор',

  // Hero
  'token.hero.badge': 'Язык для безопасного Vibe Coding',
  'token.hero.title': 'VIBEE — Компилируй AI-код в продакшн-агентов',
  'token.hero.tagline':
    'Компилятор проверяет @spec. Встроенные платежи. BEAM fault tolerance. Accept All без страха.',
  'token.hero.description':
    '45% AI-кода содержит уязвимости. VIBEE компилирует AI-генерированный код в надёжных BEAM-агентов с обязательными @spec проверками и встроенным платёжным слоем. 10 строк VIBEE вместо 120 строк Java.',
  'token.hero.stats.bugs': 'AI-кода с уязвимостями*',
  'token.hero.stats.vibee': 'с проверкой @spec',
  'token.hero.stats.safetyNet': '= безопасность на этапе компиляции',
  'token.hero.karpathy.quote':
    '"Это даже не кодинг - я просто вижу, говорю, запускаю и копирую-вставляю, и это в основном работает."',
  'token.hero.karpathy.cite':
    "— Андрей Карпатый (придумал термин 'Vibe Coding', февраль 2025)",
  'token.hero.footnote': '*Veracode 2025 GenAI Security Report',
  'token.hero.cta.editor': 'Открыть редактор',
  'token.hero.cta.docs': 'Документация',
  'token.hero.cta.demo': 'Попробовать демо',

  // Killer Feature Section
  'token.killer.badge': '🚀 KILLER FEATURE',
  'token.killer.title': 'spec.yml → Готовый плагин со 100% покрытием тестами',
  'token.killer.subtitle': 'Один YAML файл → Продакшн-код автоматически',
  'token.killer.description':
    'Опишите поведение на простом языке. Получите готовый плагин с тестами, документацией и типобезопасностью. Это то, что делает VIBEE стоящим миллиарды.',
  'token.killer.stats.time': '5 минут',
  'token.killer.stats.time_before': 'vs 40 часов',
  'token.killer.stats.cost': '$0',
  'token.killer.stats.cost_before': 'vs $2,000',
  'token.killer.stats.quality': '100% покрытие тестами',
  'token.killer.stats.quality_before': 'Гарантировано',

  // Killer Feature - How It Works
  'token.killer.how.title': 'Как Это Работает',
  'token.killer.how.step1.title': '1. Напишите spec.yml',
  'token.killer.how.step1.desc':
    'Опишите поведение на простом языке с тест-кейсами',
  'token.killer.how.step2.title': '2. Запустите генератор',
  'token.killer.how.step2.desc': 'vibee generate honeycomb/ваш_плагин',
  'token.killer.how.step3.title': '3. Получите готовый плагин',
  'token.killer.how.step3.desc':
    'Функции, тесты, документация, типы - всё сгенерировано',
  'token.killer.how.step4.title': '4. Реализуйте и тестируйте',
  'token.killer.how.step4.desc': 'Напишите реализацию, тесты уже проходят',

  // Killer Feature - Example
  'token.killer.example.title': 'Реальный пример: Telegram Bot',
  'token.killer.example.input': '400 строк YAML',
  'token.killer.example.output': '5,000+ строк кода',
  'token.killer.example.behaviors': '15 поведений',
  'token.killer.example.tests': '75 тест-кейсов',
  'token.killer.example.functions': '20 функций',
  'token.killer.example.coverage': '100% покрытие тестами',

  // Market Comparison
  'token.comparison.title': 'Лучше чем Copilot, Cursor, Devin',
  'token.comparison.subtitle': 'Рынок генерации кода $10B',
  'token.comparison.copilot.name': 'GitHub Copilot',
  'token.comparison.copilot.price': '$100/месяц',
  'token.comparison.copilot.what': 'Сниппеты кода',
  'token.comparison.copilot.tests': 'Нет',
  'token.comparison.copilot.docs': 'Нет',
  'token.comparison.cursor.name': 'Cursor AI',
  'token.comparison.cursor.price': '$20/месяц',
  'token.comparison.cursor.what': 'Файлы кода',
  'token.comparison.cursor.tests': 'Нет',
  'token.comparison.cursor.docs': 'Нет',
  'token.comparison.devin.name': 'Devin AI',
  'token.comparison.devin.price': '$500/месяц',
  'token.comparison.devin.what': 'Полные проекты',
  'token.comparison.devin.tests': 'Иногда',
  'token.comparison.devin.docs': 'Иногда',
  'token.comparison.vibee.name': 'VIBEE',
  'token.comparison.vibee.price': '$50/месяц',
  'token.comparison.vibee.what': 'Готовые плагины',
  'token.comparison.vibee.tests': '100% гарантия',
  'token.comparison.vibee.docs': 'Полная документация',

  // Savings Calculator
  'token.savings.title': 'Рассчитайте вашу экономию',
  'token.savings.subtitle': 'Посмотрите сколько времени и денег экономит VIBEE',
  'token.savings.plugins_per_month': 'Плагинов в месяц',
  'token.savings.time_saved': 'Сэкономлено времени',
  'token.savings.cost_saved': 'Сэкономлено денег',
  'token.savings.hours': 'часов/месяц',
  'token.savings.dollars': '$/месяц',
  'token.savings.cta': 'Начать экономить',

  // spec.yml Example
  'token.spec.title': 'Пример spec.yml',
  'token.spec.subtitle': 'Посмотрите как это просто',
  'token.spec.input.title': 'Вход: spec.yml (400 строк)',
  'token.spec.input.code': `name: telegram_bot
version: 2.0.0
description: Telegram бот с 45+ функциями

behaviors:
  - name: user_first_start
    given: Новый пользователь отправляет /start
    when: Создать запись пользователя и показать приветствие
    then: Пользователь создан, показан выбор языка
    test_cases:
      - name: new_user_no_ref
        input: {user_id: 123, username: "john"}
        expected: {created: true, scene: "welcome", bonus: 0}
      
      - name: new_user_with_ref
        input: {user_id: 123, ref: 456}
        expected: {created: true, referrer: 456, bonus: 100}

functions:
  - name: create_user
    params: {telegram_id: int, username: str?, language: str}
    returns: User

types:
  User:
    id: int
    telegram_id: int
    username: str?
    balance: int`,
  'token.spec.output.title': 'Выход: Готовый плагин (5,000+ строк)',
  'token.spec.output.files': 'Сгенерированные файлы:',
  'token.spec.output.file1': '✅ src/telegram_bot.gleam - Сигнатуры функций',
  'token.spec.output.file2': '✅ test/telegram_bot_test.gleam - 75 юнит-тестов',
  'token.spec.output.file3': '✅ README.md - Полная документация',
  'token.spec.output.file4': '✅ manifest.json - Метаданные плагина',
  'token.spec.output.file5': '✅ types.gleam - Определения типов',

  // Vibe Coding Section
  'token.vibe.title': 'Что такое Vibe Coding?',
  'token.vibe.definition':
    "Термин придумал Андрей Карпатый (OpenAI, Tesla) в феврале 2025. Разработчики полностью доверяют AI писать код, нажимая 'Accept All' не читая диффы. Быстро, но рискованно: 45% AI-кода содержит уязвимости.",
  'token.vibe.stats.vulnerabilities': 'AI-кода содержит уязвимости',
  'token.vibe.stats.yc': 'стартапов YC имеют 95%+ AI-кода',
  'token.vibe.stats.snippets.value': '1 из 3',
  'token.vibe.stats.snippets.label': 'AI-сниппетов с уязвимостями',
  'token.vibe.stats.source.veracode': 'Veracode 2025',
  'token.vibe.stats.source.yc': 'Y Combinator 2025',
  'token.vibe.stats.source.academic': 'Исследования',
  'token.vibe.flow.without': 'Vibe Coding без VIBEE',
  'token.vibe.flow.with': 'Vibe Coding с VIBEE',
  'token.vibe.flow.acceptAll': '✓ Accept All',
  'token.vibe.flow.securityBugs': '⚠️ Уязвимости',
  'token.vibe.flow.productionIncident': '💥 Авария в проде',
  'token.vibe.flow.specCheck': '🔒 @spec проверка',
  'token.vibe.flow.safeDeployment': '✅ Безопасный деплой',
  'token.vibe.conclusion.bold': 'VIBEE создан для этой реальности.',
  'token.vibe.conclusion.text':
    'Правила встроены в грамматику языка, не в промпты.',

  // Origin Story
  'token.origin.title':
    'Я понял проблему vibe coding раньше, чем появился термин',
  'token.origin.ch1.title': 'Vibe coding = полное доверие AI',
  'token.origin.ch1.quote':
    "\"Я работал с LLM-агентами задолго до термина 'vibe coding'. И каждый раз одна проблема: AI игнорирует правила, которые ты ему даёшь. Пишу 'сначала тесты' — он забывает. Снова и снова.\"",
  'token.origin.ch1.explanation':
    'Промпты не работают. Контекст теряется. Правила обходятся. Это и есть главная проблема vibe coding — нет enforcement.',
  'token.origin.ch2.title': '@spec = страховка для vibe coding',
  'token.origin.ch2.quote':
    '"Когда ты нажимаешь Accept All в Cursor или Claude Code, AI-код попадает в компилятор VIBEE. Если нет @spec — код не скомпилируется. Физически невозможно задеплоить непротестированный агент."',
  'token.origin.ch2.before': 'Vibe coding без VIBEE',
  'token.origin.ch2.after': 'Vibe coding с VIBEE',
  'token.origin.ch3.title': 'Accept All безопасно с декораторами',
  'token.origin.ch3.quote':
    '"AI редко добавляет retry, timeout, circuit breaker. В VIBEE это одна строка — декоратор. Accept All и получи production-ready код."',
  'token.origin.conclusion':
    'VIBEE — единственный DSL, где vibe coding становится безопасным. Правила в грамматике, не в промптах.',

  // Problem Section
  'token.problem.title': 'Проблема vibe coding — AI-код в продакшене',
  'token.problem.security.title': '45% AI-кода с уязвимостями',
  'token.problem.security.text':
    'SQL Injection, XSS, Command Injection — топ ошибок LLM. Veracode 2025: почти половина AI-кода небезопасна.',
  'token.problem.hangover.title': 'Vibe coding hangover',
  'token.problem.hangover.text':
    'SaaStr инцидент: AI-агент удалил production базу данных. Без проверок AI может сделать что угодно.',
  'token.problem.gap.title': 'Comprehension gap',
  'token.problem.gap.text':
    'Разработчики не понимают AI-код, который деплоят. Когда ломается — не знают как чинить.',

  // Fail Section
  'token.fail.title': 'Почему текущие фреймворки не подходят',
  'token.fail.config.title': 'Config-файлы без гарантий',
  'token.fail.config.text':
    'Chaining-библиотеки не дают формальных гарантий поведения: промпт меняется — всё ломается.',
  'token.fail.tests.title': 'Тесты не обязательны',
  'token.fail.tests.text':
    'Можно выкатить агента без единой проверки. Нет enforced TDD/BDD.',
  'token.fail.payments.title': 'Платежи — отдельно',
  'token.fail.payments.text':
    'Платежи и безопасность всегда «прикручиваются» отдельно, нет единой модели для транзакций.',

  // Solution Section
  'token.solution.title': 'Vibe-кодь смело — @spec поймает ошибки',
  'token.solution.p1.bold': 'VIBEE — это DSL для безопасного vibe coding.',
  'token.solution.p1.text':
    'Когда AI генерирует код, он попадает в компилятор, который требует @spec для каждого tool/agent.',
  'token.solution.p2.text':
    'Ты можешь нажимать Accept All сколько угодно — если нет спецификации Given–When–Then,',
  'token.solution.p2.bold': 'код физически не скомпилируется.',
  'token.solution.p3':
    'На выходе — production-ready агент на BEAM VM с 99.9999999% uptime. Даже vibe-coded.',

  // Code Comparison
  'token.code.title': 'Vibe-кодь быстрее на VIBEE',
  'token.code.subtitle':
    'Меньше кода = меньше мест для AI-ошибок. 10 строк VIBEE vs 120 строк Java.',
  'token.code.note':
    'VIBEE автоматически генерирует boilerplate, обработку ошибок, retry-логику и типы. Разработчик пишет только бизнес-логику.',

  // Compilation
  'token.compilation.title': 'Во что компилируется VIBEE',
  'token.compilation.subtitle':
    'VIBEE DSL → Gleam → BEAM bytecode. Посмотрите трансформацию.',
  'token.compilation.step1': 'Декларативный код',
  'token.compilation.step2': 'Type-safe код для BEAM',
  'token.compilation.step3': 'Erlang bytecode',
  'token.compilation.hotReload': 'Hot code reload',
  'token.compilation.supervision': 'Supervision trees',
  'token.compilation.ets': 'ETS caching',
  'token.compilation.distributed': 'Distributed actors',
  'token.compilation.persistent': 'Persistent state',
  'token.compilation.faultIsolation': 'Fault isolation',
  'token.compilation.note':
    '10 строк VIBEE превращаются в ~30 строк типизированного Gleam кода с retry, cache, timeout и error handling. На выходе — отказоустойчивый BEAM процесс.',

  // Syntax Comparison
  'token.syntax.title': '🔬 Сравнение синтаксиса языка VIBEE',
  'token.syntax.subtitle':
    'Все 25 синтаксических возможностей с реальными примерами кода - Нажмите на вкладки для изучения',
  'token.syntax.tabs.all': '🌟 Все (25)',
  'token.syntax.tabs.core': '🎯 Основные (5)',
  'token.syntax.tabs.operators': '⚡ Операторы (5)',
  'token.syntax.tabs.patterns': '🎨 Паттерны (5)',
  'token.syntax.tabs.advanced': '🚀 Продвинутые (5)',
  'token.syntax.tabs.types': '📦 Типы (5)',

  // Syntax Features Showcase
  'token.syntaxShowcase.badge': '7 Уникальных Возможностей',
  'token.syntaxShowcase.title.unique': 'Уникальные VIBEE',
  'token.syntaxShowcase.title.syntax': 'Синтаксические Возможности',
  'token.syntaxShowcase.subtitle':
    'Мощные возможности, которые существуют только в VIBEE - дающие вам суперсилы, которых нет в других языках',

  // All Features List
  'token.allFeatures.title':
    'Полный список: Все 25 синтаксических возможностей VIBEE',
  'token.allFeatures.subtitle':
    'Каждая возможность, которая делает VIBEE уникальным',
  'token.allFeatures.core': '🎯 Основные возможности (5)',
  'token.allFeatures.operators': '⚡ Операторы (5)',
  'token.allFeatures.patterns': '🎨 Паттерны (5)',
  'token.allFeatures.advanced': '🚀 Продвинутые (5)',
  'token.allFeatures.types': '📦 Типы (5)',

  // 25 Syntax Features
  'token.feature.1.title': '1. Pipe Оператор',
  'token.feature.2.title': "2. Сопоставление с образцом и Guard'ами",
  'token.feature.3.title': '3. Списковые выражения',
  'token.feature.4.title': '4. Методы расширения (55+)',
  'token.feature.5.title': '5. Try Оператор (Обработка ошибок)',
  'token.feature.6.title': '6. Декораторы (52 встроенных)',
  'token.feature.7.title': '7. Умные конструкторы',
  'token.feature.8.title': '8. SQL DSL',
  'token.feature.9.title': '9. Секции операторов',
  'token.feature.10.title': '10. With выражение',
  'token.feature.11.title': '11. Деструктуризация',
  'token.feature.12.title': '12. Опциональная цепочка',
  'token.feature.13.title': '13. Guard условия',
  'token.feature.14.title': '14. Менеджеры контекста',
  'token.feature.15.title': '15. Сигилы',
  'token.feature.16.title': '16. Оператор диапазона',
  'token.feature.17.title': '17. Elvis оператор',
  'token.feature.18.title': '18. Spread оператор',
  'token.feature.19.title': '19. Псевдонимы типов',
  'token.feature.20.title': '20. Непрозрачные типы',
  'token.feature.21.title': '21. Builder паттерн',
  'token.feature.22.title': '22. JSON Derive',
  'token.feature.23.title': '23. Async/Await',
  'token.feature.24.title': '24. Tap оператор (Отладка)',
  'token.feature.25.title': '25. Условный Pipe (Result)',

  // Unique Features
  'token.uniqueFeature.badge': 'Только в VIBEE',
  'token.uniqueFeature.4pipes.title': '4 Pipe оператора',
  'token.uniqueFeature.4pipes.desc':
    'В большинстве языков 0-1 pipe оператор. В VIBEE их 4 специализированных варианта для разных случаев.',
  'token.uniqueFeature.4pipes.standard': 'Стандартный',
  'token.uniqueFeature.4pipes.tap': 'Tap (Отладка)',
  'token.uniqueFeature.4pipes.conditional': 'Условный',
  'token.uniqueFeature.4pipes.indexed': 'Индексированный',
  'token.uniqueFeature.52decorators.title': '52 встроенных декоратора',
  'token.uniqueFeature.52decorators.desc':
    'В большинстве языков 0-10 декораторов. В VIBEE 52 production-ready декоратора для AI агентов.',
  'token.uniqueFeature.operatorSections.title': 'Секции операторов',
  'token.uniqueFeature.operatorSections.desc':
    'Частичное применение операторов - пишите (> 5) вместо fn(x) { x > 5 }',

  // Comparison Table
  'token.comparison.python': 'Python',
  'token.comparison.typescript': 'TypeScript',
  'token.comparison.rust': 'Rust',
  'token.comparison.go': 'Go',
  'token.comparison.gleam': 'Gleam',
  'token.comparison.typeSystem': 'Система типов',
  'token.comparison.staticTypes': 'Статическая типизация',
  'token.comparison.typeInference': 'Вывод типов',
  'token.comparison.patternMatching': 'Сопоставление с образцом',
  'token.comparison.algebraicTypes': 'Алгебраические типы',
  'token.comparison.syntaxFeatures': 'Синтаксические возможности',
  'token.comparison.decorators': 'Декораторы',
  'token.comparison.pipeOperator': 'Pipe оператор',
  'token.comparison.tryOperator': 'Try оператор',
  'token.comparison.asyncAwait': 'Async/Await',
  'token.comparison.resilience': 'Устойчивость и надежность',
  'token.comparison.builtinRetry': 'Встроенный Retry',
  'token.comparison.circuitBreaker': 'Circuit Breaker',
  'token.comparison.timeout': 'Timeout',
  'token.comparison.caching': 'Кеширование',
  'token.comparison.supervisionTrees': 'Supervision Trees',
  'token.comparison.vectorSearch': 'Векторный поиск',
  'token.comparison.embeddings': 'Эмбеддинги',
  'token.comparison.platformIntegrations': 'Интеграции с платформами',
  'token.comparison.telegramBot': 'Telegram Bot',
  'token.comparison.webhooks': 'Webhooks',
  'token.comparison.validationTesting': 'Валидация и тестирование',
  'token.comparison.runtimeValidation': 'Runtime валидация',
  'token.comparison.specTesting': 'Spec тестирование',
  'token.comparison.propertyTesting': 'Property тестирование',
  'token.comparison.performance': 'Производительность',
  'token.comparison.compilation': 'Компиляция',
  'token.comparison.hotReload': 'Hot Reload',
  'token.comparison.concurrency': 'Конкурентность',
  'token.comparison.memorySafety': 'Безопасность памяти',
  'token.comparison.developerExperience': 'Опыт разработчика',
  'token.comparison.learningCurve': 'Кривая обучения',
  'token.comparison.errorMessages': 'Сообщения об ошибках',
  'token.comparison.tooling': 'Инструменты',
  'token.comparison.productionReady': 'Готовность к продакшену',
  'token.comparison.faultTolerance': 'Отказоустойчивость',
  'token.comparison.distributed': 'Распределенность',
  'token.comparison.observability': 'Наблюдаемость',
  'token.comparison.battleTested': 'Проверено в бою',
  'token.comparison.fullSupport': 'Полная поддержка / Отлично',
  'token.comparison.partialSupport': 'Частичная поддержка / Ограничено',
  'token.comparison.summary': 'Итоги',

  // Decorators
  'token.decorators.title': 'Accept All безопасно с декораторами',
  'token.decorators.subtitle':
    'AI редко добавляет retry, timeout, circuit breaker. В VIBEE — это одна строка. 12 декораторов, 6,500+ использований.',
  'token.decorators.tabs.all': 'Все',
  'token.decorators.tabs.core': 'Основное',
  'token.decorators.tabs.resilience': 'Устойчивость',
  'token.decorators.tabs.types': 'Типы',
  'token.decorators.tabs.integrations': 'Интеграции',
  'token.decorators.spec.usage': '3,462 использований',
  'token.decorators.spec.desc':
    'TDD-first: код не компилируется без спецификации (Given-When-Then)',
  'token.decorators.impl.usage': '1,484 использований',
  'token.decorators.impl.desc':
    'Маркер реализации после @spec. Связывает спецификацию с кодом.',
  'token.decorators.retry.usage': '188 использований',
  'token.decorators.retry.desc':
    'Автоматические повторы с exponential/linear/constant backoff',
  'token.decorators.timeout.usage': '170 использований',
  'token.decorators.timeout.desc':
    'Ограничение времени выполнения. Защита от зависших вызовов.',
  'token.decorators.circuit.usage': '138 использований',
  'token.decorators.circuit.desc':
    'Паттерн "автоматический выключатель" — защита от каскадных сбоев',
  'token.decorators.cache.usage': '158 использований',
  'token.decorators.cache.desc':
    'ETS-кеширование с TTL. Мгновенный доступ к горячим данным.',
  'token.decorators.builder.usage': '403 использования',
  'token.decorators.builder.desc':
    'Builder pattern + автоматический to_json() метод',
  'token.decorators.derive.usage': '231 использование',
  'token.decorators.derive.desc':
    'Автоматическая JSON сериализация/десериализация',
  'token.decorators.enum.usage': '137 использований',
  'token.decorators.enum.desc':
    'Авто to_string() / from_string() для перечислений',
  'token.decorators.crud.usage': '64 использования',
  'token.decorators.crud.desc': 'Автоматические CRUD операции для БД сущностей',
  'token.decorators.llm.usage': '200+ использований',
  'token.decorators.llm.desc':
    'Подключение LLM провайдера. Поддержка 19+ моделей.',
  'token.decorators.telegram.usage': '150+ использований',
  'token.decorators.telegram.desc':
    'Telegram MTProto интеграция. Bot API и UserBot режимы.',
  'token.decorators.http.usage': '80+ использований',
  'token.decorators.http.desc':
    'Декларативные HTTP запросы. REST API за одну строку.',
  'token.decorators.paywall.usage': '50+ использований',
  'token.decorators.paywall.desc':
    'Платёжный шлюз перед действием. Крипта + фиат + Telegram Stars.',
  'token.decorators.fullExampleTitle':
    'Полный пример: Escrow-агент для маркетплейса',

  // Demo
  'token.demo.title': 'Пример: агент для маркетплейса за 15 минут',
  'token.demo.intro':
    'Представьте маркетплейс цифровых услуг. Продавцы и покупатели общаются с агентом: он помогает подобрать исполнителя, согласовать цену, забронировать деньги в escrow и автоматически выплатить после выполнения задачи.',
  'token.demo.step1.title': 'Опиши логику в DSL',
  'token.demo.step1.text': 'Спецификации + сценарии',
  'token.demo.step2.title': 'Скомпилируй',
  'token.demo.step2.text': 'Тесты проходят → агент готов',
  'token.demo.step3.title': 'Деплой на BEAM',
  'token.demo.step3.text': '99.9999999% uptime',
  'token.demo.step4.title': 'Подключи платежи',
  'token.demo.step4.text': 'Крипта + фиат + escrow',
  'token.demo.result':
    'Разработчик получает не «чатботик», а промышленный компонент, который можно пустить в оборот.',

  // Features
  'token.features.title': 'Продукт — из чего состоит VIBEE',
  'token.features.dsl.title': 'VIBEE DSL',
  'token.features.dsl':
    'Язык для описания логики и ограничений агента с обязательными спецификациями.',
  'token.features.beam.title': 'BEAM Runtime',
  'token.features.beam':
    'Кластер с авто-рекавери, миллионами lightweight-процессов и 99.9999999% uptime.',
  'token.features.mcp.title': 'MCP Native',
  'token.features.mcp':
    'Глубокие интеграции с Claude, Cursor и инструментами для разработчиков.',
  'token.features.payments.title': 'Payments Layer',
  'token.features.payments':
    'Крипта, фиат, P2P escrow — под управлением агента по заданным правилам.',
  'token.features.devex.title': 'Dev Experience',
  'token.features.devex':
    'CLI, SDK, one-command deploy, интеграции с CI/CD и тестовыми раннерами.',
  'token.features.rainbow.title': 'Rainbow Bridge',
  'token.features.rainbow':
    'E2E тесты на реальных Telegram аккаунтах. Не моки — живые проверки.',

  // ICP
  'token.icp.title': 'Для кого мы строим VIBEE',
  'token.icp.saas.badge': 'B2B SaaS',
  'token.icp.saas':
    'Компании, которые хотят встроить агентов в свой продукт (support, sales, ops) с контролируемым поведением.',
  'token.icp.fintech.badge': 'Финтех & Маркетплейсы',
  'token.icp.fintech.text':
    'Платформы с транзакциями, где агент должен управлять деньгами по строгим правилам.',
  'token.icp.agencies.badge': 'Студии & Агентства',
  'token.icp.agencies.text':
    'Команды, которые строят кастомных AI-агентов для клиентов и хотят промышленный стек.',

  // Moat
  'token.moat.title': 'Почему это сложно повторить',
  'token.moat.dsl.title': 'Единственный compiled DSL для AI-агентов на BEAM',
  'token.moat.dsl.text': 'Конкуренты — это библиотеки и конфиги, не языки.',
  'token.moat.tdd.title': 'Enforced TDD/BDD',
  'token.moat.tdd.text':
    'В архитектуру зашито требование спецификаций и тестов до компиляции.',
  'token.moat.payments.title': 'Нативный слой платежей и escrow',
  'token.moat.payments.text':
    'Не просто «подключи Stripe», а единая модель денег в DSL.',
  'token.moat.templates.title': 'Аккумуляция доменных шаблонов',
  'token.moat.templates.text':
    'Со временем VIBEE копит готовые «агенты по отраслям», усиливая moat.',

  // Business
  'token.business.title': 'Как VIBEE зарабатывает',
  'token.business.saas.title': 'Подписка (SaaS)',
  'token.business.saas.text':
    'Тарифы по количеству агентов, интеграций, транзакций и среде (dev/prod).',
  'token.business.month': 'мес',
  'token.business.usage.title': 'По использованию',
  'token.business.usage.text':
    'Небольшая комиссия с проходящих через агентов платежей и escrow-операций.',
  'token.business.enterprise.title': 'Enterprise',
  'token.business.enterprise.text':
    'On-prem/частные кластеры, SLA, консалтинг и кастомные интеграции.',
  'token.business.custom': 'По запросу',

  // Traction
  'token.traction.title': 'Где мы сейчас',
  'token.traction.loc': 'LOC в кодовой базе',
  'token.traction.mcp': 'MCP инструментов',
  'token.traction.ai': 'AI-интеграций',
  'token.traction.payments': 'Платежных партнеров',
  'token.traction.scenes': 'Готовых bot scenes',

  // Market
  'token.market.title': 'Рынок и момент',
  'token.market.p1':
    'Рынок AI-агентов растет с CAGR около 46%, а совокупный объём к 2034 году оценивается в $69 миллиардов.',
  'token.market.p2':
    'Инвесторы смещаются от «голых LLM» к инфраструктуре и devtools, которые позволяют делать надежные продукты поверх моделей.',
  'token.market.vc': 'AI доля в VC',

  // Competitors
  'token.competitors.title': 'Детальное сравнение с конкурентами',
  'token.competitors.subtitle': '8 ведущих AI Agent фреймворков 2025 года',
  'token.competitors.feature': 'Feature',
  'token.competitors.vibeSafe': 'Vibe Coding Safe',
  'token.competitors.specEnforced': '@spec enforced',
  'token.competitors.compileTime': 'Compile-time Checks',
  'token.competitors.typeSafety': 'Type Safety',
  'token.competitors.enforcedTests': 'Enforced Tests',
  'token.competitors.required': 'Required',
  'token.competitors.optional': 'Optional',
  'token.competitors.runtime': 'Runtime',
  'token.competitors.dynamic': 'Dynamic',
  'token.competitors.language': 'Language',
  'token.competitors.vmRuntime': 'VM / Runtime',
  'token.competitors.uptimeSla': 'Uptime SLA',
  'token.competitors.hotReload': 'Hot Code Reload',
  'token.competitors.dsl': 'DSL',
  'token.competitors.compiled': 'Compiled',
  'token.competitors.none': 'None',
  'token.competitors.minimal': 'Minimal',
  'token.competitors.config': 'Config',
  'token.competitors.pipeline': 'Pipeline',
  'token.competitors.visual': 'Visual',
  'token.competitors.multiAgent': 'Multi-Agent',
  'token.competitors.visualBuilder': 'Visual Builder',
  'token.competitors.ragSupport': 'RAG Support',
  'token.competitors.limited': 'Limited',
  'token.competitors.best': 'Best',
  'token.competitors.builtinPayments': 'Built-in Payments',
  'token.competitors.partners': '9 partners + escrow',
  'token.competitors.crypto': 'Crypto',
  'token.competitors.web3': 'Web3 / Blockchain',
  'token.competitors.full': 'Full',
  'token.competitors.telegramNative': 'Telegram Native',
  'token.competitors.mtproto': 'MTProto',
  'token.competitors.botApi': 'Bot API',
  'token.competitors.safetyReliability': 'Safety & Reliability',
  'token.competitors.runtimePerformance': 'Runtime & Performance',
  'token.competitors.featuresCategory': 'Features',
  'token.competitors.integration': 'Integration',
  'token.competitors.langchainDesc':
    'Самый популярный LLM-фреймворк. Отличная экосистема, но нет compile-time safety.',
  'token.competitors.autogenDesc':
    'Multi-agent conversations. Сильная интеграция с Azure, но Python runtime.',
  'token.competitors.crewaiDesc':
    'Role-based multi-agent. Простой API, но только sequential workflows.',
  'token.competitors.elizaosDesc':
    'Web3-first агенты. Полная интеграция с блокчейнами, но без enforced tests.',
  'token.competitors.haystackDesc':
    'Лучший для RAG и поиска. Pipeline-based, но limited multi-agent support.',
  'token.competitors.difyDesc':
    'Visual builder для AI apps. No-code подход, но нет type safety.',
  'token.competitors.conclusion':
    'VIBEE — единственный фреймворк с compile-time safety для vibe coding. @spec enforcement + BEAM runtime = production-ready агенты без страха.',

  // Roadmap
  'token.roadmap.title': 'Дорожная карта',
  'token.roadmap.q1.date': '0–6 месяцев',
  'token.roadmap.q1.title': 'Публичный релиз',
  'token.roadmap.q1.text':
    'DSL, документация, первые шаблоны агентов, 2–3 пилота.',
  'token.roadmap.q2.date': '6–12 месяцев',
  'token.roadmap.q2.title': 'Биллинг и маркетплейс',
  'token.roadmap.q2.text':
    'Usage-based, маркетплейс шаблонов, активный devrel.',
  'token.roadmap.q3.date': '12–24 месяца',
  'token.roadmap.q3.title': 'Enterprise и партнерства',
  'token.roadmap.q3.text':
    'Выход на MRR, enterprise-кейсы, партнерства с платежными и AI-платформами.',

  // Team
  'token.team.title': 'Команда',
  'token.team.founder.name': 'Дмитрий Васильев',
  'token.team.founder.bio':
    'Инженер и консультант в области AI-агентов, devtools и цифровых клонов. Опыт построения AI-сервисов, автоматизации контент-маркетинга и создания DSL-подходов к разработке.',
  'token.team.hiring':
    'Планируется усиление экспертизой в финтех-платежах, enterprise-sales и развитии open-source-комьюнити.',

  // Ask
  'token.ask.title': 'Запрос',
  'token.ask.use.title': 'Использование средств:',
  'token.ask.use.item1': 'Развитие ядра VIBEE DSL и BEAM-инфраструктуры',
  'token.ask.use.item2': 'Упаковка продукта (CLI, SDK, документация)',
  'token.ask.use.item3': 'Программа пилотов с B2B-компаниями',
  'token.ask.use.item4': 'Усиление команды (финтех, devrel, enterprise-sales)',
  'token.ask.goal':
    'Цель раунда — выйти на устойчивый MRR и 2–3 эталонных кейса по агентам с реальными транзакциями в течение 18–24 месяцев.',

  // CTA
  'token.cta.title': 'Свяжитесь с нами',
  'token.cta.subtitle': 'Обсудим пилот, инвестиции или партнёрство.',
  'token.cta.telegram': 'Telegram',
  'token.cta.twitter': 'X / Twitter',
  'token.cta.email': 'Email',

  // Footer
  'token.footer.back': '← Вернуться на главную',
}

const translations: Record<Language, Translations> = { en, ru }

// ===============================
// Detect browser language
// ===============================

function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('ru')) {
    return 'ru'
  }
  return 'en'
}

// ===============================
// Atoms
// ===============================

/**
 * Inside the game's TRI frame the language is the game's (?lang=), read on
 * the first render and never written: the frame shares localStorage with the
 * real app (on t27.ai too, because t27.ai and app.t27.ai are one site, and
 * under https://app.t27.ai/game/), whose language a write would switch. A
 * switch made inside the frame lives in memory only.
 */
const embedLanguageStorage = {
  getItem: (_key: string, initialValue: Language): Language =>
    embedLang() ?? initialValue,
  setItem: () => {},
  removeItem: () => {},
}

// Language atom with localStorage persistence
export const languageAtom = IS_EMBED
  ? atomWithStorage<Language>(
      STORAGE_KEYS.language,
      detectBrowserLanguage(),
      embedLanguageStorage,
      { getOnInit: true }
    )
  : atomWithStorage<Language>(STORAGE_KEYS.language, detectBrowserLanguage())

// Translation function atom (derived)
/**
 * `t('hive.andMore', { n: 4 })` -- substitution, added 2026-09-07.
 *
 * Without it a sentence with a number in the middle has to be assembled from
 * fragments at the call site: `t('a') + n + t('b')`. That produces two
 * half-sentences a translator cannot see the shape of, and it breaks outright
 * in any language where the number does not sit where it sits in English.
 *
 * The second argument is optional, so every existing single-argument call
 * keeps working unchanged.
 */
export const translateAtom = atom(get => {
  const lang = get(languageAtom)
  return (key: string, vars?: Record<string, string | number>): string => {
    const line = translations[lang][key] || key
    if (!vars) return line
    // An unknown placeholder is left as it stands rather than replaced with
    // "undefined": a visible `{name}` says which key is wrong, while the word
    // "undefined" on screen says nothing to anybody.
    return line.replace(/\{(\w+)\}/g, (whole, name) =>
      name in vars ? String(vars[name]) : whole
    )
  }
})

// Set language action
export const setLanguageAtom = atom(null, (get, set, lang: Language) => {
  set(languageAtom, lang)
})
