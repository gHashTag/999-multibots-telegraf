"use strict";
/**
 * 🎬 HEYGEN AVATARS CONFIGURATION
 *
 * Конфигурация аватаров HeyGen для двух владельцев:
 * - Cocoage: 8 аватаров
 * - Haim: 11 аватаров
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEYGEN_DEFAULT_VOICE_ID = exports.HEYGEN_AVATAR_SETS = exports.HAIM_AVATARS = exports.COCOAGE_AVATARS = void 0;
exports.getAvatarSet = getAvatarSet;
exports.findAvatarById = findAvatarById;
/**
 * Аватары Cocoage
 */
exports.COCOAGE_AVATARS = [
    { id: '4c34500dc5af419c9809a104874b9466', name: 'Avatar 1', emoji: '👤' },
    { id: '27c6cbedfd2b47d5b55b27419739a267', name: 'Avatar 2', emoji: '👥' },
    { id: 'e8f8c980d9234f9c8f352180e950ecbf', name: 'Avatar 3', emoji: '🎭' },
    { id: '3d35833e81604bd69614da73779ddc0a', name: 'Avatar 4', emoji: '🎪' },
    { id: 'b150fbefd4984f75a6f48551bebd0ce7', name: 'Avatar 5', emoji: '🎬' },
    { id: '11664679d7b24560b51ba88b12b5d3c3', name: 'Avatar 6', emoji: '🎨' },
    { id: '94078296b04d494c9cd84f453dacc8c9', name: 'Avatar 7', emoji: '🎯' },
    { id: '04973f5fb5c14d078e8fe7ddee8b1705', name: 'Avatar 8', emoji: '🎲' },
];
/**
 * Аватары Haim
 */
exports.HAIM_AVATARS = [
    { id: 'bf56d364324b47d791717fb1ab772f74', name: 'Avatar 1', emoji: '👤' },
    { id: 'e043a4dbe1724fd6bb6f8ec2e604dd1c', name: 'Avatar 2', emoji: '👥' },
    { id: '00bde1e30acd4de98fa870ab827209db', name: 'Avatar 3', emoji: '🎭' },
    { id: '1a9ab725dc974662afaa0e23347373b7', name: 'Avatar 4', emoji: '🎪' },
    { id: '2012999ab5d0428da44a54025bdd1580', name: 'Avatar 5', emoji: '🎬' },
    { id: 'e11c19e3e1d04d3e82b3bf2263c9684c', name: 'Avatar 6', emoji: '🎨' },
    { id: 'c61aedd2173c4c26a67af0ce6f8feb74', name: 'Avatar 7', emoji: '🎯' },
    { id: '6cb5aa7a0d574f6b8a4d802f41eb72e1', name: 'Avatar 8', emoji: '🎲' },
    { id: '24bb390a51c34a01b3a64a1906a02b45', name: 'Avatar 9', emoji: '🎰' },
    { id: 'c244b5c053094c39a7207d99ceffd558', name: 'Avatar 10', emoji: '🎻' },
    { id: 'c2251854fceb46319262660cde417d94', name: 'Avatar 11', emoji: '🎺' },
];
/**
 * Наборы аватаров с API ключами
 */
/**
 * ✅ БЕЗОПАСНО: API ключи читаются из переменных окружения (.env)
 * Добавьте в .env файл:
<<<<<<< HEAD
 * HEYGEN_COCOAGE_API_KEY=YOUR_HEYGEN_API_KEY_HERE
 * HEYGEN_HAIM_API_KEY=YOUR_HEYGEN_API_KEY_HERE
=======
 * HEYGEN_COCOAGE_API_KEY=sk_V2_hgu_...
 * HEYGEN_HAIM_API_KEY=sk_V2_hgu_...
>>>>>>> a439e5e3a6835afff1d55154e4e7140dd8ad0e13
 */
exports.HEYGEN_AVATAR_SETS = {
    cocoage: {
        name: 'Cocoage',
        apiKey: process.env.HEYGEN_COCOAGE_API_KEY || '',
        avatars: exports.COCOAGE_AVATARS,
    },
    haim: {
        name: 'Haim',
        apiKey: process.env.HEYGEN_HAIM_API_KEY || '',
        avatars: exports.HAIM_AVATARS,
    },
};
/**
 * Дефолтный voice_id для HeyGen (голос Дианы "Вау")
 * Работает со всеми HeyGen API ключами
 */
exports.HEYGEN_DEFAULT_VOICE_ID = '2b2e1f15157b454487f1250ffe586d7a';
/**
 * Получить набор аватаров по имени владельца
 */
function getAvatarSet(setName) {
    return exports.HEYGEN_AVATAR_SETS[setName.toLowerCase()] || null;
}
/**
 * Получить аватар по ID из всех наборов
 */
function findAvatarById(avatarId) {
    for (var _i = 0, _a = Object.entries(exports.HEYGEN_AVATAR_SETS); _i < _a.length; _i++) {
        var _b = _a[_i], setName = _b[0], set = _b[1];
        var avatar = set.avatars.find(function (a) { return a.id === avatarId; });
        if (avatar) {
            return { avatar: avatar, setName: set.name, apiKey: set.apiKey };
        }
    }
    return null;
}
