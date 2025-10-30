"use strict";
/**
 * 🎬 AI REELS RENDER WIZARD
 *
 * AI Reels генерация через render-server на Railway с выбором аватара
 *
 * Процесс:
 * 1. Загрузка фото аватара
 * 2. Ввод текста или голосового сообщения
 * 3. ВЫБОР АВАТАРА: Hedra или HeyGen
 * 4. Отправка на render-server через Inngest
 * 5. Получение результата через webhook
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiReelsRenderWizard = void 0;
var telegraf_1 = require("telegraf");
var centralizedLanguage_1 = require("@/helpers/centralizedLanguage");
var logger_1 = require("@/utils/logger");
var getUserBalance_1 = require("@/core/supabase/getUserBalance");
var updateUserBalance_1 = require("@/core/supabase/updateUserBalance");
var payments_interface_1 = require("@/interfaces/payments.interface");
var render_server_client_1 = require("@/inngest_app/render-server-client");
var heygen_avatars_config_1 = require("./heygen-avatars-config");
logger_1.logger.info('📦 [AI REELS RENDER WIZARD] Module loaded');
exports.aiReelsRenderWizard = new telegraf_1.Scenes.WizardScene('ai_reels_render_wizard', 
// Step 0: ВЫБОР СЕРВИСА (Hedra/HeyGen) - ПЕРВЫЙ ШАГ
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, isAvailable;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Wizard started - Service selection', {
                    telegramId: telegramId,
                });
                if (!!telegramId) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 1:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 2: return [4 /*yield*/, (0, render_server_client_1.checkRenderServerAvailability)()];
            case 3:
                isAvailable = _c.sent();
                if (!!isAvailable) return [3 /*break*/, 5];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Render-server временно недоступен. Попробуйте позже.'
                        : '❌ Render-server temporarily unavailable. Try later.')];
            case 4:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 5:
                // Инициализируем сессию
                ctx.session.aiReelsRender = {
                    step: 'avatar_service',
                    startTime: Date.now(),
                };
                return [4 /*yield*/, ctx.reply(isRu
                        ? '🎬 <b>AI Reels - Шаблон 2</b>\n\n' +
                            '🎯 Выберите сервис для генерации аватара:\n\n' +
                            '🎭 <b>Hedra</b>\n' +
                            '• Загрузите свое фото\n' +
                            '• Быстрая генерация (2-3 мин)\n' +
                            '• Хорошее качество\n\n' +
                            '🎬 <b>HeyGen</b>\n' +
                            '• Готовые профессиональные аватары\n' +
                            '• Премиум качество (4-5 мин)\n' +
                            '• Выбор из коллекции'
                        : '🎬 <b>AI Reels - Template 2</b>\n\n' +
                            '🎯 Choose avatar generation service:\n\n' +
                            '🎭 <b>Hedra</b>\n' +
                            '• Upload your photo\n' +
                            '• Fast generation (2-3 min)\n' +
                            '• Good quality\n\n' +
                            '🎬 <b>HeyGen</b>\n' +
                            '• Ready professional avatars\n' +
                            '• Premium quality (4-5 min)\n' +
                            '• Choose from collection', __assign({ parse_mode: 'HTML' }, telegraf_1.Markup.inlineKeyboard([
                        [
                            telegraf_1.Markup.button.callback(isRu ? '🎭 Hedra' : '🎭 Hedra', 'service_hedra'),
                        ],
                        [
                            telegraf_1.Markup.button.callback(isRu ? '🎬 HeyGen' : '🎬 HeyGen', 'service_heygen'),
                        ],
                    ])))];
            case 6:
                _c.sent();
                return [2 /*return*/, ctx.wizard.next()];
        }
    });
}); }, 
// Step 1: РОУТИНГ по выбору сервиса (Hedra/HeyGen)
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, callbackData;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 1 - Service routing', {
                    telegramId: telegramId,
                    hasCallbackQuery: 'callback_query' in ctx.update,
                });
                if (!!('callback_query' in ctx.update)) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Пожалуйста, нажмите одну из кнопок.'
                        : '❌ Please press one of the buttons.')];
            case 1:
                _c.sent();
                return [2 /*return*/];
            case 2:
                if (!!telegramId) return [3 /*break*/, 4];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 3:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 4:
                callbackData = 'data' in ctx.update.callback_query ? ctx.update.callback_query.data : '';
                if (!(callbackData === 'service_hedra')) return [3 /*break*/, 7];
                // ВЕТКА HEDRA: Запрос фото пользователя
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { avatarService: 'hedra', step: 'image' });
                return [4 /*yield*/, ctx.answerCbQuery()];
            case 5:
                _c.sent();
                return [4 /*yield*/, ctx.editMessageText(isRu
                        ? '✅ Выбран: 🎭 Hedra\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
                        : '✅ Selected: 🎭 Hedra\n\n📸 Send a photo or image URL with a face for avatar.')];
            case 6:
                _c.sent();
                logger_1.logger.info('🎬 [AI REELS RENDER] Hedra selected, requesting photo', {
                    telegramId: telegramId,
                });
                return [2 /*return*/, ctx.wizard.next()];
            case 7:
                if (!(callbackData === 'service_heygen')) return [3 /*break*/, 10];
                // ВЕТКА HEYGEN: Показываем выбор набора аватаров
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { avatarService: 'heygen', step: 'avatar_set_selection', imageUrl: '' });
                return [4 /*yield*/, ctx.answerCbQuery()];
            case 8:
                _c.sent();
                return [4 /*yield*/, ctx.editMessageText(isRu
                        ? '✅ Выбран: 🎬 HeyGen\n\n👥 Выберите набор аватаров:'
                        : '✅ Selected: 🎬 HeyGen\n\n👥 Choose avatar set:', __assign({ parse_mode: 'HTML' }, telegraf_1.Markup.inlineKeyboard([
                        [
                            telegraf_1.Markup.button.callback("".concat(isRu ? '👤 Cocoage' : '👤 Cocoage', " (8)"), 'heygen_set_cocoage'),
                        ],
                        [
                            telegraf_1.Markup.button.callback("".concat(isRu ? '👥 Haim' : '👥 Haim', " (11)"), 'heygen_set_haim'),
                        ],
                    ])))];
            case 9:
                _c.sent();
                logger_1.logger.info('🎬 [AI REELS RENDER] HeyGen selected, showing avatar sets', {
                    telegramId: telegramId,
                });
                // Переходим к Step 1a (выбор набора аватаров)
                return [2 /*return*/, ctx.wizard.next()];
            case 10: return [4 /*yield*/, ctx.reply(isRu
                    ? '❌ Неизвестная опция. Попробуйте еще раз.'
                    : '❌ Unknown option. Try again.')];
            case 11:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
        }
    });
}); }, 
// Step 1a: HEYGEN - Выбор набора аватаров (Cocoage/Haim)
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, callbackData, setName, avatarSet, avatarButtons, i, row, avatar1, avatar2;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 1a - Avatar set selection', {
                    telegramId: telegramId,
                    hasCallbackQuery: 'callback_query' in ctx.update,
                });
                if (!!('callback_query' in ctx.update)) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Пожалуйста, нажмите одну из кнопок.'
                        : '❌ Please press one of the buttons.')];
            case 1:
                _c.sent();
                return [2 /*return*/];
            case 2:
                if (!!telegramId) return [3 /*break*/, 4];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 3:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 4:
                callbackData = 'data' in ctx.update.callback_query ? ctx.update.callback_query.data : '';
                if (!(callbackData === 'heygen_set_cocoage' ||
                    callbackData === 'heygen_set_haim')) return [3 /*break*/, 7];
                setName = callbackData === 'heygen_set_cocoage' ? 'cocoage' : 'haim';
                avatarSet = heygen_avatars_config_1.HEYGEN_AVATAR_SETS[setName];
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { heygenAvatarSet: setName, heygenApiKey: avatarSet.apiKey });
                return [4 /*yield*/, ctx.answerCbQuery()
                    // Создаем кнопки с аватарами (по 2 в ряд)
                ];
            case 5:
                _c.sent();
                avatarButtons = [];
                for (i = 0; i < avatarSet.avatars.length; i += 2) {
                    row = [];
                    avatar1 = avatarSet.avatars[i];
                    row.push(telegraf_1.Markup.button.callback("".concat(avatar1.emoji, " ").concat(avatar1.name), "heygen_avatar_".concat(avatar1.id)));
                    if (i + 1 < avatarSet.avatars.length) {
                        avatar2 = avatarSet.avatars[i + 1];
                        row.push(telegraf_1.Markup.button.callback("".concat(avatar2.emoji, " ").concat(avatar2.name), "heygen_avatar_".concat(avatar2.id)));
                    }
                    avatarButtons.push(row);
                }
                return [4 /*yield*/, ctx.editMessageText(isRu
                        ? "\u2705 \u041D\u0430\u0431\u043E\u0440: ".concat(avatarSet.name, "\n\n") +
                            "\uD83C\uDFAD \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u0432\u0430\u0442\u0430\u0440 (".concat(avatarSet.avatars.length, " \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E):")
                        : "\u2705 Set: ".concat(avatarSet.name, "\n\n") +
                            "\uD83C\uDFAD Choose avatar (".concat(avatarSet.avatars.length, " available):"), __assign({ parse_mode: 'HTML' }, telegraf_1.Markup.inlineKeyboard(avatarButtons)))];
            case 6:
                _c.sent();
                logger_1.logger.info('🎬 [AI REELS RENDER] Avatar set selected, showing avatars', {
                    telegramId: telegramId,
                    setName: setName,
                    avatarsCount: avatarSet.avatars.length,
                });
                return [2 /*return*/, ctx.wizard.next()];
            case 7: return [4 /*yield*/, ctx.reply(isRu
                    ? '❌ Неизвестная опция. Попробуйте еще раз.'
                    : '❌ Unknown option. Try again.')];
            case 8:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
        }
    });
}); }, 
// Step 1b: HEYGEN - Выбор конкретного аватара из набора
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, callbackData, avatarId, findAvatarById, avatarInfo;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 1b - Specific avatar selection', {
                    telegramId: telegramId,
                    hasCallbackQuery: 'callback_query' in ctx.update,
                });
                if (!!('callback_query' in ctx.update)) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Пожалуйста, нажмите одну из кнопок.'
                        : '❌ Please press one of the buttons.')];
            case 1:
                _c.sent();
                return [2 /*return*/];
            case 2:
                if (!!telegramId) return [3 /*break*/, 4];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 3:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 4:
                callbackData = 'data' in ctx.update.callback_query ? ctx.update.callback_query.data : '';
                if (!callbackData.startsWith('heygen_avatar_')) return [3 /*break*/, 10];
                avatarId = callbackData.replace('heygen_avatar_', '');
                return [4 /*yield*/, Promise.resolve().then(function () { return require('./heygen-avatars-config'); })];
            case 5:
                findAvatarById = (_c.sent()).findAvatarById;
                avatarInfo = findAvatarById(avatarId);
                if (!!avatarInfo) return [3 /*break*/, 7];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Аватар не найден. Попробуйте еще раз.'
                        : '❌ Avatar not found. Try again.')];
            case 6:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 7:
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { heygenAvatarId: avatarId, step: 'text' });
                return [4 /*yield*/, ctx.answerCbQuery()];
            case 8:
                _c.sent();
                return [4 /*yield*/, ctx.editMessageText(isRu
                        ? "\u2705 \u0412\u044B\u0431\u0440\u0430\u043D \u0430\u0432\u0430\u0442\u0430\u0440: ".concat(avatarInfo.avatar.emoji, " ").concat(avatarInfo.avatar.name, "\n\n\uD83D\uDCDD \u0422\u0435\u043F\u0435\u0440\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 (\u0434\u043E 500 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432) \u0438\u043B\u0438 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 (\u0434\u043E 30 \u0441\u0435\u043A):")
                        : "\u2705 Avatar selected: ".concat(avatarInfo.avatar.emoji, " ").concat(avatarInfo.avatar.name, "\n\n\uD83D\uDCDD Now send text (up to 500 characters) or voice message (up to 30 sec):"))];
            case 9:
                _c.sent();
                logger_1.logger.info('🎬 [AI REELS RENDER] Avatar selected, requesting text input', {
                    telegramId: telegramId,
                    avatarId: avatarId,
                    setName: ctx.session.aiReelsRender.heygenAvatarSet,
                });
                // Переходим к Step 3 (текст/голос), пропуская Step 2 (Hedra фото)
                // Структура: 0, 1, 1a, 1b, 2, 3, 4, 5, 6
                // Индекс 5 = Step 3 (текст/голос)
                ctx.wizard.selectStep(5); // Индекс 5 = Step 3 (текст/голос для HeyGen)
                return [2 /*return*/];
            case 10: return [4 /*yield*/, ctx.reply(isRu
                    ? '❌ Неизвестная опция. Попробуйте еще раз.'
                    : '❌ Unknown option. Try again.')];
            case 11:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
        }
    });
}); }, 
// Step 2: HEDRA - Обработка изображения
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, message, imageUrl, photo, telegramId, fileLink, response, imageBuffer, _a, _b, createClient, _c, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serviceClient, fileName, uploadError, urlData, text, error_1;
    var _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                message = ctx.message;
                imageUrl = null;
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 2 - Hedra: Processing image', {
                    telegramId: (_e = (_d = ctx.from) === null || _d === void 0 ? void 0 : _d.id) === null || _e === void 0 ? void 0 : _e.toString(),
                });
                _h.label = 1;
            case 1:
                _h.trys.push([1, 13, , 15]);
                if (!(message && 'photo' in message && message.photo.length > 0)) return [3 /*break*/, 8];
                photo = message.photo[message.photo.length - 1];
                telegramId = (_g = (_f = ctx.from) === null || _f === void 0 ? void 0 : _f.id) === null || _g === void 0 ? void 0 : _g.toString();
                return [4 /*yield*/, ctx.telegram.getFileLink(photo.file_id)];
            case 2:
                fileLink = _h.sent();
                return [4 /*yield*/, fetch(fileLink.href)];
            case 3:
                response = _h.sent();
                if (!response.ok) {
                    throw new Error("Failed to download photo: ".concat(response.statusText));
                }
                _b = (_a = Buffer).from;
                return [4 /*yield*/, response.arrayBuffer()];
            case 4:
                imageBuffer = _b.apply(_a, [_h.sent()]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@supabase/supabase-js'); })];
            case 5:
                createClient = (_h.sent()).createClient;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@/config'); })];
            case 6:
                _c = _h.sent(), SUPABASE_URL = _c.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY = _c.SUPABASE_SERVICE_ROLE_KEY;
                serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                fileName = "ai-reels-render/".concat(telegramId, "/").concat(Date.now(), ".jpg");
                return [4 /*yield*/, serviceClient.storage
                        .from('images')
                        .upload(fileName, imageBuffer, {
                        contentType: 'image/jpeg',
                        upsert: false,
                    })];
            case 7:
                uploadError = (_h.sent()).error;
                if (uploadError) {
                    throw new Error("Upload failed: ".concat(uploadError.message));
                }
                urlData = serviceClient.storage
                    .from('images')
                    .getPublicUrl(fileName).data;
                imageUrl = urlData.publicUrl;
                logger_1.logger.info('✅ [AI REELS RENDER] Photo uploaded', {
                    telegramId: telegramId,
                    imageUrl: imageUrl.substring(0, 100),
                });
                return [3 /*break*/, 9];
            case 8:
                if (message && 'text' in message) {
                    text = message.text.trim();
                    if (text.startsWith('http://') || text.startsWith('https://')) {
                        imageUrl = text;
                    }
                }
                _h.label = 9;
            case 9:
                if (!!imageUrl) return [3 /*break*/, 11];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Некорректное изображение. Отправьте фото или URL.'
                        : '❌ Invalid image. Send a photo or URL.')];
            case 10:
                _h.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 11:
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { imageUrl: imageUrl, step: 'text' });
                return [4 /*yield*/, ctx.reply(isRu
                        ? '✅ Изображение получено!\n\n' +
                            '📝 Отправьте текст (до 500 символов) или голосовое сообщение (до 30 сек).'
                        : '✅ Image received!\n\n' +
                            '📝 Send text (up to 500 characters) or voice message (up to 30 sec).')];
            case 12:
                _h.sent();
                return [2 /*return*/, ctx.wizard.next()];
            case 13:
                error_1 = _h.sent();
                logger_1.logger.error('❌ [AI REELS RENDER] Image processing error', { error: error_1 });
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Произошла ошибка при обработке изображения.'
                        : '❌ Error processing image.')];
            case 14:
                _h.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 15: return [2 /*return*/];
        }
    });
}); }, 
// Step 3: Обработка текста/голоса (для Hedra и HeyGen)
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, message, telegramId, text, audioUrl, voice, fileLink, response, audioBuffer, _a, _b, createClient, _c, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serviceClient, fileName, uploadError, urlData, createAudioFileFromText, getVoiceId, voiceId, audioPath, fs, audioBuffer, createClient, _d, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serviceClient, fileName, uploadError, urlData, cleanupError_1, audioError_1, estimatedDuration, words, veo3Cost, hedraPerSecond, finalCost, finalCostUSD, error_2;
    var _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                message = ctx.message;
                telegramId = (_f = (_e = ctx.from) === null || _e === void 0 ? void 0 : _e.id) === null || _f === void 0 ? void 0 : _f.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 3 - Processing text/voice', {
                    telegramId: telegramId,
                });
                if (!!telegramId) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 1:
                _g.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 2:
                _g.trys.push([2, 35, , 37]);
                text = '';
                audioUrl = null;
                if (!(message && 'voice' in message)) return [3 /*break*/, 11];
                voice = message.voice;
                if (!(voice.duration > 30)) return [3 /*break*/, 4];
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\u274C \u0413\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u043E\u0435 (".concat(voice.duration, " \u0441\u0435\u043A). \u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C: 30 \u0441\u0435\u043A\u0443\u043D\u0434.")
                        : "\u274C Voice message is too long (".concat(voice.duration, " sec). Maximum: 30 seconds."))];
            case 3:
                _g.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 4: return [4 /*yield*/, ctx.telegram.getFileLink(voice.file_id)];
            case 5:
                fileLink = _g.sent();
                return [4 /*yield*/, fetch(fileLink.href)];
            case 6:
                response = _g.sent();
                _b = (_a = Buffer).from;
                return [4 /*yield*/, response.arrayBuffer()];
            case 7:
                audioBuffer = _b.apply(_a, [_g.sent()]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@supabase/supabase-js'); })];
            case 8:
                createClient = (_g.sent()).createClient;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@/config'); })];
            case 9:
                _c = _g.sent(), SUPABASE_URL = _c.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY = _c.SUPABASE_SERVICE_ROLE_KEY;
                serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                fileName = "ai-reels-render-audio/".concat(telegramId, "/").concat(Date.now(), ".ogg");
                return [4 /*yield*/, serviceClient.storage
                        .from('images')
                        .upload(fileName, audioBuffer, {
                        contentType: 'audio/ogg',
                        upsert: false,
                    })];
            case 10:
                uploadError = (_g.sent()).error;
                if (uploadError) {
                    throw new Error("Upload failed: ".concat(uploadError.message));
                }
                urlData = serviceClient.storage
                    .from('images')
                    .getPublicUrl(fileName).data;
                audioUrl = urlData.publicUrl;
                text = "voice_message_".concat(voice.duration);
                return [3 /*break*/, 33];
            case 11:
                if (!(message && 'text' in message)) return [3 /*break*/, 31];
                text = message.text.trim();
                if (!(text.length === 0 || text.length > 500)) return [3 /*break*/, 13];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Текст должен быть от 1 до 500 символов.'
                        : '❌ Text must be between 1 and 500 characters.')];
            case 12:
                _g.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 13:
                // ✅ ИСПРАВЛЕНИЕ: Генерируем аудио из текста через централизованную систему
                logger_1.logger.info('🎤 [AI REELS RENDER] Генерируем аудио из текста', {
                    telegramId: telegramId,
                    textLength: text.length,
                });
                _g.label = 14;
            case 14:
                _g.trys.push([14, 28, , 30]);
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@/core/elevenlabs/createAudioFileFromText'); })];
            case 15:
                createAudioFileFromText = (_g.sent()).createAudioFileFromText;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@/core/supabase/getVoiceId'); })];
            case 16:
                getVoiceId = (_g.sent()).getVoiceId;
                return [4 /*yield*/, getVoiceId(telegramId)];
            case 17:
                voiceId = _g.sent();
                if (!voiceId) {
                    throw new Error('User voice ID not found for audio generation');
                }
                logger_1.logger.info('🎤 [AI REELS RENDER] Используем централизованную систему голосов', {
                    telegramId: telegramId,
                    voiceId: voiceId,
                    textLength: text.length,
                });
                return [4 /*yield*/, createAudioFileFromText({
                        text: text,
                        voice_id: voiceId,
                        telegram_id: telegramId,
                    })];
            case 18:
                audioPath = _g.sent();
                if (!audioPath) {
                    throw new Error('Failed to generate audio from text');
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require('fs/promises'); })];
            case 19:
                fs = _g.sent();
                return [4 /*yield*/, fs.readFile(audioPath)];
            case 20:
                audioBuffer = _g.sent();
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@supabase/supabase-js'); })];
            case 21:
                createClient = (_g.sent()).createClient;
                return [4 /*yield*/, Promise.resolve().then(function () { return require('@/config'); })];
            case 22:
                _d = _g.sent(), SUPABASE_URL = _d.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY = _d.SUPABASE_SERVICE_ROLE_KEY;
                serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                fileName = "ai-reels-render-generated-audio/".concat(telegramId, "/").concat(Date.now(), ".mp3");
                return [4 /*yield*/, serviceClient.storage
                        .from('images')
                        .upload(fileName, audioBuffer, {
                        contentType: 'audio/mpeg',
                        upsert: false,
                    })];
            case 23:
                uploadError = (_g.sent()).error;
                if (uploadError) {
                    throw new Error("Upload failed: ".concat(uploadError.message));
                }
                urlData = serviceClient.storage
                    .from('images')
                    .getPublicUrl(fileName).data;
                audioUrl = urlData.publicUrl;
                _g.label = 24;
            case 24:
                _g.trys.push([24, 26, , 27]);
                return [4 /*yield*/, fs.unlink(audioPath)];
            case 25:
                _g.sent();
                return [3 /*break*/, 27];
            case 26:
                cleanupError_1 = _g.sent();
                logger_1.logger.warn('⚠️ [AI REELS RENDER] Не удалось удалить временный файл', {
                    audioPath: audioPath,
                    error: cleanupError_1,
                });
                return [3 /*break*/, 27];
            case 27:
                logger_1.logger.info('✅ [AI REELS RENDER] Аудио сгенерировано через централизованную систему', {
                    telegramId: telegramId,
                    voiceId: voiceId,
                    audioUrl: audioUrl.substring(0, 100),
                });
                return [3 /*break*/, 30];
            case 28:
                audioError_1 = _g.sent();
                logger_1.logger.error('❌ [AI REELS RENDER] Ошибка генерации аудио из текста', {
                    error: audioError_1,
                    telegramId: telegramId,
                });
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка генерации аудио из текста. Попробуйте отправить голосовое сообщение.'
                        : '❌ Error generating audio from text. Try sending a voice message.')];
            case 29:
                _g.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 30: return [3 /*break*/, 33];
            case 31: return [4 /*yield*/, ctx.reply(isRu
                    ? '❌ Пожалуйста, отправьте текст или голосовое сообщение.'
                    : '❌ Please send text or voice message.')];
            case 32:
                _g.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 33:
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { text: text, audioUrl: audioUrl, step: 'intro_text' });
                estimatedDuration = 10 // секунд по умолчанию
                ;
                if (audioUrl && 'voice' in message) {
                    // Для голоса - точная длительность
                    estimatedDuration = message.voice.duration || 10;
                }
                else {
                    words = text.split(/\s+/).length;
                    estimatedDuration = Math.ceil(words / 2.5);
                }
                // Сохраняем длительность для расчета цены
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { estimatedDuration: estimatedDuration });
                veo3Cost = 240 // с наценкой x1.5
                ;
                hedraPerSecond = 7 // с наценкой x1.5
                ;
                finalCost = veo3Cost + estimatedDuration * hedraPerSecond;
                finalCostUSD = (finalCost / 100).toFixed(2);
                // Запрос первой части заголовка для обложки
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\u2705 \u0422\u0435\u043A\u0441\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D!\n\n" +
                            "\uD83D\uDCDD \u0422\u0435\u043F\u0435\u0440\u044C \u0432\u0432\u0435\u0434\u0438\u0442\u0435 <b>\u043F\u0435\u0440\u0432\u0443\u044E \u0447\u0430\u0441\u0442\u044C</b> \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0430 \u0434\u043B\u044F \u043E\u0431\u043B\u043E\u0436\u043A\u0438:\n\n" +
                            "\uD83C\uDFA8 <b>\u042D\u0442\u043E \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0441\u0442\u0430\u0432\u043D\u043E\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0438\u0437 \u0434\u0432\u0443\u0445 \u0447\u0430\u0441\u0442\u0435\u0439:</b>\n" +
                            "\u2022 \u041F\u0435\u0440\u0432\u0430\u044F \u0447\u0430\u0441\u0442\u044C: [\u0432\u0430\u0448 \u0442\u0435\u043A\u0441\u0442] (\u0434\u043E 50 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432)\n" +
                            "\u2022 \u0412\u0442\u043E\u0440\u0430\u044F \u0447\u0430\u0441\u0442\u044C: [\u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u0434\u0430\u043B\u0435\u0435]\n\n" +
                            "\uD83D\uDCA1 <i>\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \"\u0424\u041E\u0422\u041E\u0420\u0415\u0410\u041B\u042C\u041D\u042B\u0419 \u0410\u0412\u0410\u0422\u0410\u0420\"</i>"
                        : "\u2705 Text received!\n\n" +
                            "\uD83D\uDCDD Now enter the <b>first part</b> of the cover title:\n\n" +
                            "\uD83C\uDFA8 <b>This will be a composite title with two parts:</b>\n" +
                            "\u2022 First part: [your text] (up to 50 characters)\n" +
                            "\u2022 Second part: [will be requested next]\n\n" +
                            "\uD83D\uDCA1 <i>For example: \"PHOTOREALISTIC AVATAR\"</i>", { parse_mode: 'HTML' })];
            case 34:
                // Запрос первой части заголовка для обложки
                _g.sent();
                return [2 /*return*/, ctx.wizard.next()];
            case 35:
                error_2 = _g.sent();
                logger_1.logger.error('❌ [AI REELS RENDER] Text/voice processing error', {
                    error: error_2,
                });
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Произошла ошибка при обработке данных.'
                        : '❌ Error processing data.')];
            case 36:
                _g.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 37: return [2 /*return*/];
        }
    });
}); }, 
// Step 4: Ввод текста интро для обложки
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, introText;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 4 - Intro text input', {
                    telegramId: telegramId,
                    step: 'intro_text',
                });
                if (!!telegramId) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 1:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 2:
                if (!(ctx.message && 'text' in ctx.message)) return [3 /*break*/, 6];
                introText = ctx.message.text.trim();
                if (!(introText.length === 0 || introText.length > 50)) return [3 /*break*/, 4];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Текст интро должен быть от 1 до 50 символов.'
                        : '❌ Intro text must be between 1 and 50 characters.')];
            case 3:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 4:
                // Сохраняем первый текст интро
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { introText1: introText, step: 'intro_text_2' });
                // Запрос второго текста интро
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\u2705 \u041F\u0435\u0440\u0432\u0430\u044F \u0447\u0430\u0441\u0442\u044C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0430: \"".concat(introText, "\"\n\n") +
                            "\uD83D\uDCDD \u0422\u0435\u043F\u0435\u0440\u044C \u0432\u0432\u0435\u0434\u0438\u0442\u0435 <b>\u0432\u0442\u043E\u0440\u0443\u044E \u0447\u0430\u0441\u0442\u044C</b> \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0430 (\u0434\u043E 50 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432):\n\n" +
                            "\uD83C\uDFA8 <b>\u042D\u0442\u043E \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0441\u0442\u0430\u0432\u043D\u043E\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A:</b>\n" +
                            "\u2022 \u041F\u0435\u0440\u0432\u0430\u044F \u0447\u0430\u0441\u0442\u044C: \"".concat(introText, "\"\n") +
                            "\u2022 \u0412\u0442\u043E\u0440\u0430\u044F \u0447\u0430\u0441\u0442\u044C: [\u0432\u0430\u0448 \u0442\u0435\u043A\u0441\u0442]\n\n" +
                            "\uD83D\uDCA1 <i>\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \"\u0410\u0412\u0410\u0422\u0410\u0420\", \"NEWS\", \"TECH\"</i>"
                        : "\u2705 First part of title: \"".concat(introText, "\"\n\n") +
                            "\uD83D\uDCDD Now enter the <b>second part</b> of title (up to 50 characters):\n\n" +
                            "\uD83C\uDFA8 <b>This will be a composite title:</b>\n" +
                            "\u2022 First part: \"".concat(introText, "\"\n") +
                            "\u2022 Second part: [your text]\n\n" +
                            "\uD83D\uDCA1 <i>For example: \"AVATAR\", \"NEWS\", \"TECH\"</i>", { parse_mode: 'HTML' })];
            case 5:
                // Запрос второго текста интро
                _c.sent();
                return [2 /*return*/, ctx.wizard.next()];
            case 6: return [4 /*yield*/, ctx.reply(isRu
                    ? '❌ Пожалуйста, отправьте текст для интро (до 50 символов).'
                    : '❌ Please send intro text (up to 50 characters).')];
            case 7:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
        }
    });
}); }, 
// Step 5: Ввод второго текста интро
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, introText2, estimatedDuration, words, veo3Cost, hedraPerSecond, baseCost, finalCost, finalCostUSD, service, serviceName;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 5 - Second intro text input', {
                    telegramId: telegramId,
                    step: 'intro_text_2',
                });
                if (!!telegramId) return [3 /*break*/, 2];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 1:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 2:
                if (!(ctx.message && 'text' in ctx.message)) return [3 /*break*/, 9];
                introText2 = ctx.message.text.trim();
                if (!(introText2.length === 0 || introText2.length > 50)) return [3 /*break*/, 4];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Второй текст интро должен быть от 1 до 50 символов.'
                        : '❌ Second intro text must be between 1 and 50 characters.')];
            case 3:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 4:
                // Сохраняем второй текст интро
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { introText2: introText2, upperIntroText: introText2, step: 'processing' });
                estimatedDuration = 10 // секунд по умолчанию
                ;
                if (ctx.session.aiReelsRender.audioUrl && 'voice' in ctx.message) {
                    // Для голоса - точная длительность
                    estimatedDuration = ctx.message.voice.duration || 10;
                }
                else {
                    words = (ctx.session.aiReelsRender.text || '').split(/\s+/).length;
                    estimatedDuration = Math.ceil(words / 2.5);
                }
                // Сохраняем длительность для расчета цены
                ctx.session.aiReelsRender = __assign(__assign({}, ctx.session.aiReelsRender), { estimatedDuration: estimatedDuration });
                veo3Cost = 160;
                hedraPerSecond = 14;
                baseCost = veo3Cost + estimatedDuration * hedraPerSecond;
                finalCost = Math.ceil(baseCost * 2) // x2 наценка
                ;
                finalCostUSD = (finalCost / 100).toFixed(2);
                if (!ctx.session.aiReelsRender.avatarService) return [3 /*break*/, 7];
                service = ctx.session.aiReelsRender.avatarService;
                serviceName = service === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen';
                logger_1.logger.info('🎬 [AI REELS RENDER] Service already selected, skipping duplicate choice', {
                    telegramId: telegramId,
                    avatarService: service,
                    heygenAvatarId: ctx.session.aiReelsRender.heygenAvatarId,
                });
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\u2705 <b>\u0421\u043E\u0441\u0442\u0430\u0432\u043D\u043E\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0441\u043E\u0437\u0434\u0430\u043D:</b>\n" +
                            "\uD83C\uDFA8 \"".concat(ctx.session.aiReelsRender.introText1, "\" + \"").concat(introText2, "\"\n\n") +
                            "\uD83D\uDCCA <b>\u0420\u0430\u0441\u0447\u0435\u0442 \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u0438:</b>\n" +
                            "\u2022 \u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C: ~".concat(estimatedDuration, " \u0441\u0435\u043A\n") +
                            "\u2022 4 \u0432\u0438\u0434\u0435\u043E VEO3 Fast: 160\u2B50\n" +
                            "\u2022 Hedra lip-sync: ".concat(estimatedDuration, " \u00D7 14\u2B50/\u0441\u0435\u043A = ").concat(estimatedDuration * hedraPerSecond, "\u2B50\n") +
                            "\u2022 <b>\u0418\u0442\u043E\u0433\u043E: ".concat(finalCost, "\u2B50 ($").concat(finalCostUSD, ")</b>\n\n") +
                            "\u2705 \u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u0447\u0435\u0440\u0435\u0437 ".concat(serviceName, "\n\n\u23F3 \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 render-server...")
                        : "\u2705 <b>Composite title created:</b>\n" +
                            "\uD83C\uDFA8 \"".concat(ctx.session.aiReelsRender.introText1, "\" + \"").concat(introText2, "\"\n\n") +
                            "\uD83D\uDCCA <b>Cost calculation:</b>\n" +
                            "\u2022 Duration: ~".concat(estimatedDuration, " sec\n") +
                            "\u2022 4 VEO3 Fast videos: 160\u2B50\n" +
                            "\u2022 Hedra lip-sync: ".concat(estimatedDuration, " \u00D7 14\u2B50/sec = ").concat(estimatedDuration * hedraPerSecond, "\u2B50\n") +
                            "\u2022 <b>Total: ".concat(finalCost, "\u2B50 ($").concat(finalCostUSD, ")</b>\n\n") +
                            "\u2705 Generating with ".concat(serviceName, "\n\n\u23F3 Sending request to render-server..."), { parse_mode: 'HTML' })
                    // ✅ ИСПРАВЛЕНИЕ: Переходим к Step 6
                ];
            case 5:
                _c.sent();
                // ✅ ИСПРАВЛЕНИЕ: Переходим к Step 6
                logger_1.logger.info('🎬 [AI REELS RENDER] Service already selected, proceeding to Step 6', {
                    telegramId: telegramId,
                    avatarService: service,
                });
                // Переключаем на Step 6 (индекс 8)
                ctx.wizard.selectStep(8);
                return [4 /*yield*/, ctx.wizard.steps[ctx.wizard.cursor](ctx)];
            case 6: 
            // ✅ Вызываем handler Step 6 напрямую
            // @ts-ignore - steps is private but we need direct invocation
            return [2 /*return*/, _c.sent()];
            case 7: 
            // ❌ УСТАРЕВШИЙ ПУТЬ: Если сервис НЕ выбран (только для Hedra flow из старого кода)
            // Запрос выбора сервиса аватара
            return [4 /*yield*/, ctx.reply(isRu
                    ? "\u2705 <b>\u0421\u043E\u0441\u0442\u0430\u0432\u043D\u043E\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0441\u043E\u0437\u0434\u0430\u043D:</b>\n" +
                        "\uD83C\uDFA8 \"".concat(ctx.session.aiReelsRender.introText1, "\" + \"").concat(introText2, "\"\n\n") +
                        "\uD83D\uDCCA <b>\u0420\u0430\u0441\u0447\u0435\u0442 \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u0438:</b>\n" +
                        "\u2022 \u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C: ~".concat(estimatedDuration, " \u0441\u0435\u043A\n") +
                        "\u2022 4 \u0432\u0438\u0434\u0435\u043E VEO3 Fast: 160\u2B50\n" +
                        "\u2022 Hedra lip-sync: ".concat(estimatedDuration, " \u00D7 14\u2B50/\u0441\u0435\u043A = ").concat(estimatedDuration * hedraPerSecond, "\u2B50\n") +
                        "\u2022 <b>\u0418\u0442\u043E\u0433\u043E: ".concat(finalCost, "\u2B50 ($").concat(finalCostUSD, ")</b>\n\n") +
                        "\uD83C\uDFAD \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0435\u0440\u0432\u0438\u0441 \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0430\u0432\u0430\u0442\u0430\u0440\u0430:\n\n" +
                        "\uD83C\uDFAD <b>Hedra</b> - \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F\n" +
                        "   \u2022 \u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C: ".concat(finalCost, "\u2B50\n") +
                        "   \u2022 \u0412\u0440\u0435\u043C\u044F: 2-3 \u043C\u0438\u043D\u0443\u0442\u044B\n\n" +
                        "\uD83C\uDFAC <b>HeyGen</b> - \u043F\u0440\u0435\u043C\u0438\u0443\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u043E\n" +
                        "   \u2022 \u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C: ".concat(finalCost, "\u2B50\n") +
                        "   \u2022 \u0412\u0440\u0435\u043C\u044F: 4-5 \u043C\u0438\u043D\u0443\u0442"
                    : "\u2705 <b>Composite title created:</b>\n" +
                        "\uD83C\uDFA8 \"".concat(ctx.session.aiReelsRender.introText1, "\" + \"").concat(introText2, "\"\n\n") +
                        "\uD83D\uDCCA <b>Cost calculation:</b>\n" +
                        "\u2022 Duration: ~".concat(estimatedDuration, " sec\n") +
                        "\u2022 4 VEO3 Fast videos: 160\u2B50\n" +
                        "\u2022 Hedra lip-sync: ".concat(estimatedDuration, " \u00D7 14\u2B50/sec = ").concat(estimatedDuration * hedraPerSecond, "\u2B50\n") +
                        "\u2022 <b>Total: ".concat(finalCost, "\u2B50 ($").concat(finalCostUSD, ")</b>\n\n") +
                        "\uD83C\uDFAD Choose avatar generation service:\n\n" +
                        "\uD83C\uDFAD <b>Hedra</b> - quality generation\n" +
                        "   \u2022 Cost: ".concat(finalCost, "\u2B50\n") +
                        "   \u2022 Time: 2-3 minutes\n\n" +
                        "\uD83C\uDFAC <b>HeyGen</b> - premium quality\n" +
                        "   \u2022 Cost: ".concat(finalCost, "\u2B50\n") +
                        "   \u2022 Time: 4-5 minutes", __assign({ parse_mode: 'HTML' }, telegraf_1.Markup.inlineKeyboard([
                    [
                        telegraf_1.Markup.button.callback(isRu
                            ? "\uD83C\uDFAD Hedra (".concat(finalCost, "\u2B50)")
                            : "\uD83C\uDFAD Hedra (".concat(finalCost, "\u2B50)"), 'avatar_hedra'),
                        telegraf_1.Markup.button.callback(isRu
                            ? "\uD83C\uDFAC HeyGen (".concat(finalCost, "\u2B50)")
                            : "\uD83C\uDFAC HeyGen (".concat(finalCost, "\u2B50)"), 'avatar_heygen'),
                    ],
                ])))];
            case 8:
                // ❌ УСТАРЕВШИЙ ПУТЬ: Если сервис НЕ выбран (только для Hedra flow из старого кода)
                // Запрос выбора сервиса аватара
                _c.sent();
                return [2 /*return*/, ctx.wizard.next()];
            case 9: return [4 /*yield*/, ctx.reply(isRu
                    ? '❌ Пожалуйста, отправьте второй текст для интро (до 50 символов).'
                    : '❌ Please send second intro text (up to 50 characters).')];
            case 10:
                _c.sent();
                return [2 /*return*/, ctx.scene.leave()];
        }
    });
}); }, 
// Step 6: Отправка на render-server (avatarService уже выбран в Step 1)
function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
    var isRu, telegramId, avatarService, voiceIdToUse, getVoiceId, userVoiceId, heygenAvatarId, heygenApiKey, defaultAvatar, payload, elevenLabsToken, duration, veo3Cost, hedraPerSecond, estimatedCost, currentBalance, eventId, error_3, error_4, isRu;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return __generator(this, function (_p) {
        switch (_p.label) {
            case 0:
                console.log('🔴🔴🔴 [RENDER WIZARD STEP 6] FUNCTION EXECUTING!!!');
                console.log('🔴 [RENDER WIZARD STEP 6] Update type:', ctx.updateType);
                _p.label = 1;
            case 1:
                _p.trys.push([1, 24, , 26]);
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                telegramId = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toString();
                logger_1.logger.info('🎬 [AI REELS RENDER] Step 6 - Sending to render-server', {
                    telegramId: telegramId,
                    avatarService: ctx.session.aiReelsRender.avatarService,
                });
                if (!!telegramId) return [3 /*break*/, 3];
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка: не удалось определить ваш ID'
                        : '❌ Error: could not determine your ID')];
            case 2:
                _p.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 3:
                avatarService = ctx.session.aiReelsRender.avatarService || 'hedra';
                console.log('🔴 [STEP 6] Avatar service from session:', avatarService);
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\u2705 \u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u0447\u0435\u0440\u0435\u0437 ".concat(avatarService === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen', "\n\n\u23F3 \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 render-server...")
                        : "\u2705 Generating with ".concat(avatarService === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen', "\n\n\u23F3 Sending request to render-server..."))];
            case 4:
                _p.sent();
                console.log('🔴 [STEP 6] Creating payload...');
                voiceIdToUse = void 0;
                if (!(avatarService === 'heygen')) return [3 /*break*/, 5];
                // Для HeyGen всегда используем дефолтный voice_id (голос Дианы)
                voiceIdToUse = heygen_avatars_config_1.HEYGEN_DEFAULT_VOICE_ID;
                console.log('🔴 [STEP 6] Using HeyGen default voice_id:', voiceIdToUse);
                return [3 /*break*/, 10];
            case 5: return [4 /*yield*/, Promise.resolve().then(function () { return require('@/core/supabase/getVoiceId'); })];
            case 6:
                getVoiceId = (_p.sent()).getVoiceId;
                return [4 /*yield*/, getVoiceId(telegramId)];
            case 7:
                userVoiceId = _p.sent();
                if (!!userVoiceId) return [3 /*break*/, 9];
                console.log('🔴 [STEP 6] ERROR: No user voice ID found for Hedra!');
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ У вас не настроен голос аватара. Создайте голос сначала.'
                        : '❌ You dont have avatar voice configured. Create voice first.')];
            case 8:
                _p.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 9:
                voiceIdToUse = userVoiceId;
                console.log('🔴 [STEP 6] Using user voice ID for Hedra:', voiceIdToUse);
                _p.label = 10;
            case 10:
                heygenAvatarId = ctx.session.aiReelsRender.heygenAvatarId;
                heygenApiKey = ctx.session.aiReelsRender.heygenApiKey;
                if (avatarService === 'heygen') {
                    if (!heygenAvatarId || !heygenApiKey) {
                        logger_1.logger.error('🔴 [STEP 6] HeyGen avatar data missing!', {
                            telegramId: telegramId,
                            hasAvatarId: !!heygenAvatarId,
                            hasApiKey: !!heygenApiKey,
                        });
                        defaultAvatar = heygen_avatars_config_1.HEYGEN_AVATAR_SETS.cocoage.avatars[0];
                        ctx.session.aiReelsRender.heygenAvatarId = defaultAvatar.id;
                        ctx.session.aiReelsRender.heygenApiKey = heygen_avatars_config_1.HEYGEN_AVATAR_SETS.cocoage.apiKey;
                    }
                }
                console.log('🔴 [STEP 6] HeyGen config:', {
                    avatarId: heygenAvatarId === null || heygenAvatarId === void 0 ? void 0 : heygenAvatarId.substring(0, 15),
                    apiKeyPrefix: heygenApiKey === null || heygenApiKey === void 0 ? void 0 : heygenApiKey.substring(0, 15),
                    fromSession: true,
                });
                payload = (0, render_server_client_1.createRenderAvatarPayload)(telegramId, ctx.session.aiReelsRender.text || '', ctx.session.aiReelsRender.imageUrl || '', voiceIdToUse, // ✅ Используем дефолтный voice_id для HeyGen или user voice_id для Hedra
                {
                    coverUrl: 'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg',
                    introText1: ctx.session.aiReelsRender.introText1 || 'Ai-Stars',
                    introText2: ctx.session.aiReelsRender.introText2 || 'News',
                    // ✅ NEW API: avatarService, heygenApiKey, heygenAvatarId - используем из сессии!
                    avatarService: avatarService,
                    heygenApiKey: avatarService === 'heygen' ? heygenApiKey : undefined,
                    heygenAvatarId: avatarService === 'heygen' ? heygenAvatarId : undefined,
                });
                elevenLabsToken = process.env.ELEVENLABS_API_KEY;
                if (!!elevenLabsToken) return [3 /*break*/, 12];
                console.log('🔴 [STEP 6] ERROR: ELEVENLABS_API_KEY not found in ENV!');
                logger_1.logger.error('[AI REELS RENDER] Missing ELEVENLABS_API_KEY', {
                    telegramId: telegramId,
                });
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Ошибка конфигурации сервера (ElevenLabs token). Обратитесь к администратору.'
                        : '❌ Server configuration error (ElevenLabs token). Contact admin.')];
            case 11:
                _p.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 12:
                console.log('🔴 [STEP 6] Payload created with voice ID:', voiceIdToUse);
                console.log('🔴 [STEP 6] ElevenLabs token (masked):', elevenLabsToken.substring(0, 10) + '...');
                // ✅ ЛОГИРОВАНИЕ: Проверяем payload перед отправкой
                logger_1.logger.info('[AI REELS RENDER] Payload validation', {
                    telegramId: telegramId,
                    hasElevenLabsToken: !!payload.eleven_labs_api_key,
                    elevenLabsTokenPrefix: payload.eleven_labs_api_key.substring(0, 10),
                    voiceId: voiceIdToUse,
                    voiceIdType: avatarService === 'heygen' ? 'heygen_default' : 'user_voice',
                    avatarService: avatarService,
                    avatarPhotoUrl: (_c = ctx.session.aiReelsRender.imageUrl) === null || _c === void 0 ? void 0 : _c.substring(0, 50),
                    textLength: (_d = ctx.session.aiReelsRender.text) === null || _d === void 0 ? void 0 : _d.length,
                    heygenEnabled: avatarService === 'heygen',
                    hedraEnabled: avatarService === 'hedra',
                });
                console.log('🔴 [STEP 6] Payload structure:', {
                    hasHeygenSettings: !!payload.avatar_settings.heygen,
                    hasHedraSettings: !!payload.avatar_settings.hedra,
                });
                duration = ctx.session.aiReelsRender.estimatedDuration || 10;
                veo3Cost = 240 // 160⭐ × 1.5
                ;
                hedraPerSecond = 7 // ~4.9⭐/сек × 1.5
                ;
                estimatedCost = veo3Cost + duration * hedraPerSecond;
                console.log('🔴 [STEP 6] Dynamic cost calculation:', {
                    duration: duration,
                    veo3Cost: veo3Cost,
                    hedraPerSecond: hedraPerSecond,
                    estimatedCost: estimatedCost,
                    markup: 1.5,
                });
                // Проверка баланса
                console.log('🔴 [STEP 6] Getting user balance...');
                return [4 /*yield*/, (0, getUserBalance_1.getUserBalance)(telegramId)];
            case 13:
                currentBalance = _p.sent();
                console.log('🔴 [STEP 6] Current balance:', currentBalance);
                console.log('🔴 [STEP 6] Checking if balance sufficient...');
                if (!(currentBalance === null || currentBalance < estimatedCost)) return [3 /*break*/, 15];
                console.log('🔴 [STEP 6] INSUFFICIENT BALANCE!');
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\uD83D\uDCB0 \u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0441\u0440\u0435\u0434\u0441\u0442\u0432\n\n\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F: ".concat(estimatedCost, "\u2B50\n\u0423 \u0432\u0430\u0441: ").concat((currentBalance || 0).toFixed(2), "\u2B50")
                        : "\uD83D\uDCB0 Insufficient funds\n\nRequired: ".concat(estimatedCost, "\u2B50\nYou have: ").concat((currentBalance || 0).toFixed(2), "\u2B50"))];
            case 14:
                _p.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 15:
                console.log('🔴 [STEP 6] Balance sufficient! Charging user...');
                // Списание средств
                return [4 /*yield*/, (0, updateUserBalance_1.updateUserBalance)(telegramId, estimatedCost, payments_interface_1.PaymentType.MONEY_OUTCOME, "AI Reels Render (".concat(avatarService, ")"), {
                        bot_name: ((_e = ctx.botInfo) === null || _e === void 0 ? void 0 : _e.username) || 'unknown_bot',
                        service_type: 'ai_reels_render',
                        avatar_service: avatarService,
                    })];
            case 16:
                // Списание средств
                _p.sent();
                console.log('🔴 [STEP 6] User charged successfully!');
                console.log('🔴 [STEP 6] Sending event to render-server...');
                _p.label = 17;
            case 17:
                _p.trys.push([17, 20, , 23]);
                console.log('🔴 [STEP 6] Inside sendEvent try block');
                console.log('🔴 [STEP 6] Payload job_id:', payload.job_id);
                console.log('🔴 [STEP 6] Payload keys:', Object.keys(payload));
                // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Полный payload перед отправкой на render-server
                logger_1.logger.info('🎬 [AI REELS RENDER] Starting event send', {
                    telegramId: telegramId,
                    avatarService: avatarService,
                    payloadJobId: payload.job_id,
                    payloadKeys: Object.keys(payload),
                    imageUrl: (_f = ctx.session.aiReelsRender.imageUrl) === null || _f === void 0 ? void 0 : _f.substring(0, 100),
                    text: (_g = ctx.session.aiReelsRender.text) === null || _g === void 0 ? void 0 : _g.substring(0, 50),
                });
                logger_1.logger.info('🎬 [AI REELS RENDER] FULL PAYLOAD DETAILS', {
                    telegramId: telegramId,
                    job_id: payload.job_id,
                    avatarService: avatarService, // ✅ NEW: avatarService вместо avatar_gen_service
                    eleven_labs_api_key_present: !!payload.eleven_labs_api_key,
                    eleven_labs_api_key_prefix: ((_h = payload.eleven_labs_api_key) === null || _h === void 0 ? void 0 : _h.substring(0, 10)) || 'MISSING',
                    kie_api_key_present: !!payload.kie_api_key,
                    avatar_settings: {
                        // ✅ NEW: Логируем heygen или hedra в зависимости от выбора
                        heygen: payload.avatar_settings.heygen
                            ? {
                                avatar_id: payload.avatar_settings.heygen.avatar_id,
                                voice_id: payload.avatar_settings.heygen.voice_id,
                                avatar_speech_length: payload.avatar_settings.heygen.avatar_speech.length,
                                api_key_present: !!payload.avatar_settings.heygen.api_key,
                            }
                            : null,
                        hedra: payload.avatar_settings.hedra
                            ? {
                                avatar_id: payload.avatar_settings.hedra.avatar_id,
                                voice_id: payload.avatar_settings.hedra.voice_id,
                                avatar_photo_url: payload.avatar_settings.hedra.avatar_photo_url.substring(0, 50),
                                avatar_speech_length: payload.avatar_settings.hedra.avatar_speech.length,
                                api_key_present: !!payload.avatar_settings.hedra.api_key,
                            }
                            : null,
                    },
                    intro_text_1: payload.intro_text_1.text,
                    intro_text_2: payload.intro_text_2.text,
                });
                console.log('🔴 [STEP 6] CRITICAL: Payload voice_id:', {
                    heygen: ((_j = payload.avatar_settings.heygen) === null || _j === void 0 ? void 0 : _j.voice_id) || null,
                    hedra: ((_k = payload.avatar_settings.hedra) === null || _k === void 0 ? void 0 : _k.voice_id) || null,
                });
                console.log('🔴 [STEP 6] CRITICAL: Payload eleven_labs_api_key (first 10 chars):', (_l = payload.eleven_labs_api_key) === null || _l === void 0 ? void 0 : _l.substring(0, 10));
                console.log('🔴 [STEP 6] About to call sendRenderAvatarVideoEvent()...');
                return [4 /*yield*/, (0, render_server_client_1.sendRenderAvatarVideoEvent)(payload)];
            case 18:
                eventId = (_p.sent()).eventId;
                console.log('🔴 [STEP 6] Event sent! Event ID:', eventId);
                console.log('🔴 [STEP 6] Sending success reply to user...');
                return [4 /*yield*/, ctx.reply(isRu
                        ? "\u2705 \u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u043D\u0430 render-server!\n\n" +
                            "\uD83D\uDD04 Event ID: ".concat(eventId, "\n") +
                            "\uD83C\uDFAD \u0421\u0435\u0440\u0432\u0438\u0441: ".concat(avatarService === 'hedra' ? 'Hedra' : 'HeyGen', "\n") +
                            "\u23F1\uFE0F \u041E\u0436\u0438\u0434\u0430\u0435\u043C\u043E\u0435 \u0432\u0440\u0435\u043C\u044F: 2-5 \u043C\u0438\u043D\u0443\u0442\n" +
                            "\uD83D\uDCE2 \u0412\u044B \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043A\u043E\u0433\u0434\u0430 \u0432\u0438\u0434\u0435\u043E \u0431\u0443\u0434\u0435\u0442 \u0433\u043E\u0442\u043E\u0432\u043E\n\n" +
                            "\uD83D\uDCB0 \u0421\u043F\u0438\u0441\u0430\u043D\u043E: ".concat(estimatedCost, "\u2B50\n") +
                            "\uD83D\uDCB3 \u041D\u043E\u0432\u044B\u0439 \u0431\u0430\u043B\u0430\u043D\u0441: ".concat((currentBalance - estimatedCost).toFixed(2), "\u2B50")
                        : "\u2705 Request sent to render-server!\n\n" +
                            "\uD83D\uDD04 Event ID: ".concat(eventId, "\n") +
                            "\uD83C\uDFAD Service: ".concat(avatarService === 'hedra' ? 'Hedra' : 'HeyGen', "\n") +
                            "\u23F1\uFE0F Expected time: 2-5 minutes\n" +
                            "\uD83D\uDCE2 You will receive notification when video is ready\n\n" +
                            "\uD83D\uDCB0 Charged: ".concat(estimatedCost, "\u2B50\n") +
                            "\uD83D\uDCB3 New balance: ".concat((currentBalance - estimatedCost).toFixed(2), "\u2B50"), { parse_mode: 'HTML' })];
            case 19:
                _p.sent();
                console.log('🔴 [STEP 6] Reply sent to user!');
                logger_1.logger.info('✅ [AI REELS RENDER] Event sent successfully', {
                    telegramId: telegramId,
                    eventId: eventId,
                    avatarService: avatarService,
                    cost: estimatedCost,
                });
                console.log('🔴 [STEP 6] All done! Cleaning up...');
                return [3 /*break*/, 23];
            case 20:
                error_3 = _p.sent();
                console.log('🔴🔴🔴 [STEP 6] CAUGHT ERROR IN SEND EVENT!');
                console.log('🔴 [STEP 6] Error:', error_3);
                console.log('🔴 [STEP 6] Error message:', error_3 instanceof Error ? error_3.message : String(error_3));
                logger_1.logger.error('❌ [AI REELS RENDER] Error sending event', { error: error_3 });
                // Возврат средств при ошибке
                return [4 /*yield*/, (0, updateUserBalance_1.updateUserBalance)(telegramId, estimatedCost, payments_interface_1.PaymentType.MONEY_INCOME, "Refund: AI Reels Render error", {
                        bot_name: ((_m = ctx.botInfo) === null || _m === void 0 ? void 0 : _m.username) || 'unknown_bot',
                        service_type: 'refund',
                    })];
            case 21:
                // Возврат средств при ошибке
                _p.sent();
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Произошла ошибка при отправке запроса. Средства возвращены.'
                        : '❌ Error sending request. Funds refunded.')];
            case 22:
                _p.sent();
                return [3 /*break*/, 23];
            case 23:
                // Очистка сессии
                delete ctx.session.aiReelsRender;
                return [2 /*return*/, ctx.scene.leave()];
            case 24:
                error_4 = _p.sent();
                console.log('🔴🔴🔴 [STEP 6] CAUGHT ERROR!');
                console.log('🔴 [STEP 6] Error:', error_4);
                console.log('🔴 [STEP 6] Error message:', error_4 instanceof Error ? error_4.message : String(error_4));
                console.log('🔴 [STEP 6] Error stack:', error_4 instanceof Error ? error_4.stack : 'NO STACK');
                logger_1.logger.error('❌ [AI REELS RENDER] Step 6 ERROR', {
                    error: error_4 instanceof Error ? error_4.message : String(error_4),
                    stack: error_4 instanceof Error ? error_4.stack : undefined,
                    telegramId: (_o = ctx.from) === null || _o === void 0 ? void 0 : _o.id,
                });
                isRu = (0, centralizedLanguage_1.isRussianFromState)(ctx);
                return [4 /*yield*/, ctx.reply(isRu
                        ? '❌ Произошла критическая ошибка. Попробуйте позже.'
                        : '❌ Critical error occurred. Try again later.')];
            case 25:
                _p.sent();
                return [2 /*return*/, ctx.scene.leave()];
            case 26: return [2 /*return*/];
        }
    });
}); });
exports.default = exports.aiReelsRenderWizard;
