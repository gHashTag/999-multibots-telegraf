import React from 'react';
import './global.css';

// Import images
import heroCoder from './assets/images/hero-coder.jpg';
import img01 from './assets/images/01.jpeg';
import img05 from './assets/images/05.jpeg';
import img06 from './assets/images/06.jpeg';
import img07 from './assets/images/07.jpeg';
import img08 from './assets/images/08.jpeg';
import img09 from './assets/images/09.jpeg';

export default function App() {
  return (
    <main className="min-h-screen bg-[#0c0a09] text-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0c0a09] via-[#1a1816] to-[#0c0a09]">
        <img src={heroCoder} alt="Hero" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0a09]/60 via-[#0c0a09]/50 to-[#0c0a09]/80" />

        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="mb-6">
            <span className="text-sm font-bold text-[#f6ff00] px-4 py-2 bg-[#f6ff00]/10 rounded-full border border-[#f6ff00]/30">
              🏦 ПЕРВЫЙ ФОНД В СНГ
            </span>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold mb-6" style={{fontFamily: 'Playfair Display, serif'}}>
            <span className="bg-gradient-to-r from-[#f6ff00] to-[#ffea00] bg-clip-text text-transparent">
              DAO VIBEE
            </span>
          </h1>

          <div className="bg-gradient-to-r from-[#f6ff00] to-[#ffea00] px-8 py-4 rounded-xl inline-block mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-black" style={{fontFamily: 'Playfair Display, serif'}}>
              Децентрализованный Фонд AI-Агентов
            </h2>
          </div>

          <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
            Единственный фонд, который инвестирует ТОЛЬКО в AI-агенты
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
            <div className="bg-[#141210] p-6 rounded-xl border border-[#3b2a13]">
              <div className="text-white font-bold text-sm">✅ 200+ портфельных компаний</div>
            </div>
            <div className="bg-[#141210] p-6 rounded-xl border border-[#3b2a13]">
              <div className="text-white font-bold text-sm">⭐ $120K MRR</div>
            </div>
            <div className="bg-[#141210] p-6 rounded-xl border border-[#3b2a13]">
              <div className="text-white font-bold text-sm">💼 45% Target IRR</div>
            </div>
          </div>

          <button className="px-8 py-4 bg-[#f6ff00] text-black font-bold text-lg rounded-xl hover:bg-[#e6ef00] transition-all">
            📚 Инвестировать в фонд
          </button>
        </div>
      </section>

      {/* What If Section */}
      <section className="py-20 bg-[#0c0a09]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Что если...</h2>
          <p className="text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
            80% офисных работников будут заменены AI-агентами к 2027 году?
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13]">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">$450B</div>
              <div className="text-gray-400">Рынок AI-агентов к 2030</div>
            </div>
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13]">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">300%</div>
              <div className="text-gray-400">ROI для ранних инвесторов</div>
            </div>
          </div>

          <p className="text-xl text-gray-300 mt-12">
            Мы инвестируем в компании, которые делают это реальностью
          </p>
        </div>
      </section>

      {/* Agents Portfolio */}
      <section className="py-20 bg-[#0c0a09]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm font-bold text-[#f6ff00] px-4 py-2 bg-[#f6ff00]/10 rounded-full border border-[#f6ff00]/30">
              🤖 ПОРТФЕЛЬ АГЕНТОВ
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mt-4 mb-4">
              Рой из <span className="bg-gradient-to-r from-[#f6ff00] to-[#ffea00] bg-clip-text text-transparent">6 специализированных</span> AI-агентов
            </h2>
            <p className="text-gray-400 text-xl max-w-2xl mx-auto">
              Каждый агент решает конкретную бизнес-задачу и приносит реальный доход
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {/* Agent 1: Нейроблогер */}
            <div className="bg-[#141210] rounded-2xl border border-[#3b2a13] overflow-hidden hover:border-[#f6ff00]/50 transition-all hover:scale-105">
              <img src={img08} alt="Нейроблогер" className="w-full h-48 object-cover" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center border border-[#f6ff00]/20">
                    <span className="text-2xl">📝</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">Нейроблогер</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-[#f6ff00]/20 text-[#f6ff00] px-2 py-1 rounded-full">Масштабирование</span>
                      <span className="text-xs text-[#C6A94C]">$250K инвестировано</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  <strong className="text-[#f6ff00]">Проблема:</strong> Блогеры тратят 40+ часов/неделю на создание контента
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  <strong className="text-[#f6ff00]">Решение:</strong> AI генерирует видео с цифровым двойником за 5 минут
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[#f6ff00] font-bold">1,000+</div>
                    <div className="text-gray-500">Пользователей</div>
                  </div>
                  <div>
                    <div className="text-[#f6ff00] font-bold">$45K</div>
                    <div className="text-gray-500">MRR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 2: Агент Репозитории */}
            <div className="bg-[#141210] rounded-2xl border border-[#3b2a13] overflow-hidden hover:border-[#f6ff00]/50 transition-all hover:scale-105">
              <img src={img07} alt="Агент Репозитории" className="w-full h-48 object-cover" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center border border-[#f6ff00]/20">
                    <span className="text-2xl">💻</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">Агент Репозитории</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-[#f6ff00]/20 text-[#f6ff00] px-2 py-1 rounded-full">Рост</span>
                      <span className="text-xs text-[#C6A94C]">$180K инвестировано</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  <strong className="text-[#f6ff00]">Проблема:</strong> Разработчики тратят 30% времени на рутину
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  <strong className="text-[#f6ff00]">Решение:</strong> AI автоматизирует GitHub workflow
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[#f6ff00] font-bold">500+</div>
                    <div className="text-gray-500">Репозиториев</div>
                  </div>
                  <div>
                    <div className="text-[#f6ff00] font-bold">$32K</div>
                    <div className="text-gray-500">MRR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 3: Нейрозвонки */}
            <div className="bg-[#141210] rounded-2xl border border-[#3b2a13] overflow-hidden hover:border-[#f6ff00]/50 transition-all hover:scale-105">
              <img src={img06} alt="Нейрозвонки" className="w-full h-48 object-cover" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center border border-[#f6ff00]/20">
                    <span className="text-2xl">📞</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">Нейрозвонки</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-[#f6ff00]/20 text-[#f6ff00] px-2 py-1 rounded-full">PMF достигнут</span>
                      <span className="text-xs text-[#C6A94C]">$150K инвестировано</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  <strong className="text-[#f6ff00]">Проблема:</strong> B2B продажи требуют сотни звонков
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  <strong className="text-[#f6ff00]">Решение:</strong> AI делает персонализированные звонки
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[#f6ff00] font-bold">50K+</div>
                    <div className="text-gray-500">Звонков</div>
                  </div>
                  <div>
                    <div className="text-[#f6ff00] font-bold">$28K</div>
                    <div className="text-gray-500">MRR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 4: Нейротренер */}
            <div className="bg-[#141210] rounded-2xl border border-[#3b2a13] overflow-hidden hover:border-[#f6ff00]/50 transition-all hover:scale-105">
              <img src={img05} alt="Нейротренер" className="w-full h-48 object-cover" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center border border-[#f6ff00]/20">
                    <span className="text-2xl">🎓</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">Нейротренер</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-[#f6ff00]/20 text-[#f6ff00] px-2 py-1 rounded-full">Seed</span>
                      <span className="text-xs text-[#C6A94C]">$120K инвестировано</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  <strong className="text-[#f6ff00]">Проблема:</strong> 70% материала корп. обучения забывается
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  <strong className="text-[#f6ff00]">Решение:</strong> Персональный AI-тренер для каждого
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[#f6ff00] font-bold">200+</div>
                    <div className="text-gray-500">Клиентов</div>
                  </div>
                  <div>
                    <div className="text-[#f6ff00] font-bold">$18K</div>
                    <div className="text-gray-500">MRR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 5: Нейробиржа */}
            <div className="bg-[#141210] rounded-2xl border border-[#3b2a13] overflow-hidden hover:border-[#f6ff00]/50 transition-all hover:scale-105">
              <img src={img09} alt="Нейробиржа" className="w-full h-48 object-cover" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center border border-[#f6ff00]/20">
                    <span className="text-2xl">📈</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">Нейробиржа</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-[#f6ff00]/20 text-[#f6ff00] px-2 py-1 rounded-full">Beta</span>
                      <span className="text-xs text-[#C6A94C]">$200K инвестировано</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  <strong className="text-[#f6ff00]">Проблема:</strong> Трейдеры проигрывают 89% из-за эмоций
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  <strong className="text-[#f6ff00]">Решение:</strong> AI торгует без эмоций
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[#f6ff00] font-bold">$2.4M</div>
                    <div className="text-gray-500">AUM</div>
                  </div>
                  <div>
                    <div className="text-[#f6ff00] font-bold">$12K</div>
                    <div className="text-gray-500">MRR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent 6: Инстаграм Распаковщик */}
            <div className="bg-[#141210] rounded-2xl border border-[#3b2a13] overflow-hidden hover:border-[#f6ff00]/50 transition-all hover:scale-105">
              <img src={img01} alt="Инстаграм Распаковщик" className="w-full h-48 object-cover" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center border border-[#f6ff00]/20">
                    <span className="text-2xl">📸</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold">Инстаграм Распаковщик</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-[#f6ff00]/20 text-[#f6ff00] px-2 py-1 rounded-full">Масштабирование</span>
                      <span className="text-xs text-[#C6A94C]">$180K инвестировано</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  <strong className="text-[#f6ff00]">Проблема:</strong> 95% людей не понимают аналитику Instagram
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  <strong className="text-[#f6ff00]">Решение:</strong> AI анализирует и дает рекомендации
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[#f6ff00] font-bold">80+</div>
                    <div className="text-gray-500">Early adopters</div>
                  </div>
                  <div>
                    <div className="text-[#f6ff00] font-bold">$5K</div>
                    <div className="text-gray-500">MRR</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Market Section */}
      <section className="py-20 bg-[#0c0a09]">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-4 mb-12">
            <div className="w-16 h-16 rounded-xl bg-[#f6ff00]/10 flex items-center justify-center">
              <span className="text-3xl">📊</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold">Рынок AI-Агентов</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13]">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">$25B</div>
              <div className="text-gray-400 mb-4">TAM к 2025</div>
              <div className="text-sm text-gray-500">Прогноз Gartner</div>
            </div>
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13]">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">127%</div>
              <div className="text-gray-400 mb-4">CAGR</div>
              <div className="text-sm text-gray-500">Годовой рост</div>
            </div>
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13]">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">$150B</div>
              <div className="text-gray-400 mb-4">Рынок к 2030</div>
              <div className="text-sm text-gray-500">Прогноз роста</div>
            </div>
          </div>
        </div>
      </section>

      {/* Financials */}
      <section className="py-20 bg-[#0c0a09]">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-4 mb-12">
            <div className="w-16 h-16 rounded-xl bg-[#f6ff00]/10 flex items-center justify-center">
              <span className="text-3xl">💰</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold">Финансы и Возврат</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13] text-center">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">45%</div>
              <div className="text-gray-400 mb-4">Target IRR</div>
              <div className="text-sm text-gray-500">Годовая доходность</div>
            </div>
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13] text-center">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">3.5x</div>
              <div className="text-gray-400 mb-4">MOIC</div>
              <div className="text-sm text-gray-500">Через 5 лет</div>
            </div>
            <div className="bg-[#141210] p-8 rounded-2xl border border-[#3b2a13] text-center">
              <div className="text-5xl font-bold text-[#f6ff00] mb-2">10x</div>
              <div className="text-gray-400 mb-4">Best Case</div>
              <div className="text-sm text-gray-500">Максимальный потенциал</div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 bg-[#141210]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Нам доверяют лидеры индустрии</h2>
            <p className="text-gray-400 text-lg">Присоединяйтесь к 200+ компаниям, которые уже инвестируют в AI-агенты</p>
          </div>

          {/* Partner Logos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto mb-16">
            <div className="bg-[#0c0a09] p-6 rounded-xl border border-[#3b2a13] flex items-center justify-center">
              <div className="text-2xl font-bold text-gray-500">OpenAI</div>
            </div>
            <div className="bg-[#0c0a09] p-6 rounded-xl border border-[#3b2a13] flex items-center justify-center">
              <div className="text-2xl font-bold text-gray-500">Anthropic</div>
            </div>
            <div className="bg-[#0c0a09] p-6 rounded-xl border border-[#3b2a13] flex items-center justify-center">
              <div className="text-2xl font-bold text-gray-500">Google Cloud</div>
            </div>
            <div className="bg-[#0c0a09] p-6 rounded-xl border border-[#3b2a13] flex items-center justify-center">
              <div className="text-2xl font-bold text-gray-500">Microsoft</div>
            </div>
          </div>

          {/* Testimonials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <div className="bg-[#0c0a09] p-6 rounded-xl border border-[#3b2a13]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center">
                  <span className="text-xl">👤</span>
                </div>
                <div>
                  <div className="font-bold">Алексей Иванов</div>
                  <div className="text-sm text-gray-500">CEO, Нейроблогер</div>
                </div>
              </div>
              <p className="text-gray-400 italic">"DAO VIBEE помогли нам масштабироваться от 0 до $45K MRR за 6 месяцев. Лучшая инвестиция в нашу компанию."</p>
            </div>

            <div className="bg-[#0c0a09] p-6 rounded-xl border border-[#3b2a13]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#f6ff00]/20 to-[#f6ff00]/5 flex items-center justify-center">
                  <span className="text-xl">👤</span>
                </div>
                <div>
                  <div className="font-bold">Мария Петрова</div>
                  <div className="text-sm text-gray-500">Founder, Нейробиржа</div>
                </div>
              </div>
              <p className="text-gray-400 italic">"Первый фонд, который по-настоящему понимает AI-агенты. Они не просто дают деньги, они помогают расти."</p>
            </div>
          </div>

          {/* Media Mentions */}
          <div className="text-center mt-16">
            <div className="text-sm text-gray-500 mb-4">Featured in:</div>
            <div className="flex flex-wrap justify-center gap-8">
              <div className="text-gray-600">TechCrunch</div>
              <div className="text-gray-600">VentureBeat</div>
              <div className="text-gray-600">The Information</div>
              <div className="text-gray-600">Forbes AI</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-[#141210] to-[#0c0a09]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Готовы инвестировать в будущее AI?
          </h2>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Присоединяйтесь к фонду, который меняет индустрию
          </p>

          {/* Scarcity & Urgency */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="bg-[#141210] p-6 rounded-xl border border-[#f6ff00]/30 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-400">Прогресс фонда</span>
                <span className="text-sm font-bold text-[#f6ff00]">$8M / $10M (80%)</span>
              </div>
              <div className="w-full bg-[#3b2a13] rounded-full h-3 overflow-hidden">
                <div className="bg-gradient-to-r from-[#f6ff00] to-[#ffea00] h-full rounded-full" style={{width: '80%'}}></div>
              </div>
              <div className="text-xs text-gray-500 mt-2">Осталось только $2M до закрытия фонда</div>
            </div>
            <div className="text-red-400 font-bold mb-2">⏰ Q1 2025 close - 47 дней осталось</div>
            <div className="text-sm text-gray-400">Присоединяйтесь к Sequoia, a16z и 15 другим LP</div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button className="px-8 py-4 bg-[#f6ff00] text-black font-bold text-lg rounded-xl hover:bg-[#e6ef00] transition-all hover:scale-105">
              💰 Инвестировать сейчас
            </button>
            <button className="px-8 py-4 border-2 border-[#f6ff00] text-[#f6ff00] font-bold text-lg rounded-xl hover:bg-[#f6ff00] hover:text-black transition-all">
              📄 Скачать pitch deck
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-[#0c0a09] border-t border-[#3b2a13]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="text-xl font-bold mb-4">DAO VIBEE</h3>
              <p className="text-gray-400 text-sm">Децентрализованный Фонд AI-Агентов</p>
              <p className="text-gray-400 text-sm mt-2">Первый фонд в СНГ, инвестирующий ТОЛЬКО в AI-агенты</p>
            </div>
            <div>
              <h4 className="text-lg font-bold mb-4">Контакты</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <p>📧 invest@vibee.fund</p>
                <p>📅 calendly.com/vibee-fund</p>
                <p>📄 Data room для инвесторов</p>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-bold mb-4">Инвестиции</h4>
              <div className="space-y-2 text-sm text-gray-400">
                <p>💰 Минимум: $100K (angels)</p>
                <p className="ml-5">$250K (institutions)</p>
                <p>🎯 Fund size: $10M</p>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-[#3b2a13] text-center text-gray-500">
            <p>© 2025 DAO VIBEE. Децентрализованный Фонд AI-Агентов</p>
            <p className="mt-2 text-sm">🚀 Инвестируем в будущее искусственного интеллекта</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
