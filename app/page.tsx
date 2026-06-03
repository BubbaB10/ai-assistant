'use client'

import Link from 'next/link'

const SMS_PREVIEW = [
  { from: 'user', text: 'Did I go over budget on restaurants this month?' },
  { from: 'planner', text: "Yep — $340 of your $300 limit. Most of it was last weekend. You've got $0 left for dining out this week." },
  { from: 'user', text: 'Am I on track to save $500 this month?' },
  { from: 'planner', text: "Close. You're at $380 saved so far. Cut $120 more this week and you'll hit it." },
]

function SMSBubble({ from, text }: { from: string; text: string }) {
  const isUser = from === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-snug ${
          isUser
            ? 'bg-[#6366f1] text-white rounded-br-sm'
            : 'bg-gray-700 text-gray-100 rounded-bl-sm'
        }`}
      >
        {!isUser && (
          <div className="text-xs text-[#818cf8] font-semibold mb-1">Planner</div>
        )}
        {text}
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#111827] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#6366f1] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Planner</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="text-gray-400 hover:text-white text-sm transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-gray-400 hover:text-white text-sm transition-colors">
            Pricing
          </a>
          <Link
            href="/onboard"
            className="bg-[#6366f1] hover:bg-[#4f46e5] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-[#1f2937] border border-[#374151] rounded-full px-4 py-1.5 text-sm text-[#818cf8] mb-8">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              SMS-first, no app required
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
              Meet your personal{' '}
              <span className="text-[#6366f1]">chief of staff.</span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed mb-10">
              Text it like a friend. Get real answers about your money, your week, and your life — instantly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/onboard"
                className="bg-[#6366f1] hover:bg-[#4f46e5] text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors text-center"
              >
                Get Started Free
              </Link>
              <a
                href="#how-it-works"
                className="border border-[#374151] hover:border-[#6366f1] text-gray-300 px-8 py-4 rounded-xl font-semibold text-lg transition-colors text-center"
              >
                See How It Works
              </a>
            </div>
            <p className="text-gray-500 text-sm mt-4">No app. No login. Just text.</p>
          </div>

          {/* Right: SMS Preview */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm bg-[#1c2333] border border-[#2d3748] rounded-3xl overflow-hidden shadow-2xl">
              {/* Phone header */}
              <div className="bg-[#161d2e] px-4 py-3 flex items-center gap-3 border-b border-[#2d3748]">
                <div className="w-8 h-8 bg-[#6366f1] rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">P</span>
                </div>
                <div>
                  <div className="text-sm font-semibold">Planner</div>
                  <div className="text-xs text-green-400">Online</div>
                </div>
              </div>
              {/* Messages */}
              <div className="p-4 space-y-1">
                {SMS_PREVIEW.map((msg, i) => (
                  <SMSBubble key={i} from={msg.from} text={msg.text} />
                ))}
              </div>
              {/* Input bar */}
              <div className="px-4 pb-4">
                <div className="bg-[#161d2e] rounded-full px-4 py-2.5 flex items-center gap-2">
                  <span className="text-gray-500 text-sm flex-1">Text anything...</span>
                  <div className="w-7 h-7 bg-[#6366f1] rounded-full flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-[#0f1623] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple. That&apos;s the point.</h2>
            <p className="text-gray-400 text-lg">Three steps and you&apos;re live.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Tell us about yourself',
                desc: '2 minutes, 3 questions. Your name, email, and phone number. That&apos;s it.',
              },
              {
                step: '02',
                title: 'Connect your bank',
                desc: 'We sync your transactions so Planner knows your actual numbers. (Coming soon)',
              },
              {
                step: '03',
                title: 'Text us anything',
                desc: 'Finances, decisions, reminders — whatever you need. Real answers, instantly.',
              },
            ].map((item) => (
              <div key={item.step} className="bg-[#1c2333] border border-[#2d3748] rounded-2xl p-8">
                <div className="text-5xl font-black text-[#6366f1] mb-4 opacity-40">{item.step}</div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.desc }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Straight pricing.</h2>
            <p className="text-gray-400 text-lg">No hidden fees. No upsells. Just the assistant you need.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Personal */}
            <div className="bg-[#1c2333] border-2 border-[#6366f1] rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-6">
                <span className="bg-[#6366f1] text-white text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</span>
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-1">Personal</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">$39</span>
                  <span className="text-gray-400">/mo</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'SMS assistant — ask anything, anytime',
                  'Weekly financial summary (Monday morning)',
                  'Budget alerts when you&apos;re close to limits',
                  'On-demand Q&A about your money',
                  'Up to 200 messages/month',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-[#6366f1] mt-0.5">&#10003;</span>
                    <span className="text-gray-300" dangerouslySetInnerHTML={{ __html: feature }} />
                  </li>
                ))}
              </ul>
              <Link
                href="/onboard"
                className="block w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white py-3 rounded-xl font-semibold text-center transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Bundle */}
            <div className="bg-[#1c2333] border border-[#2d3748] rounded-2xl p-8 opacity-75">
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-1">Bundle</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">$199</span>
                  <span className="text-gray-400">/mo</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Everything in Personal',
                  'AI Bookkeeper — automated transaction tracking',
                  'AI Estimator — project cost intelligence (trade)',
                  'Priority support',
                  'Unlimited messages',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-500 mt-0.5">&#10003;</span>
                    <span className="text-gray-400">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                disabled
                className="block w-full bg-[#1f2937] text-gray-500 py-3 rounded-xl font-semibold text-center cursor-not-allowed"
              >
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0f1623] py-24">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to stop guessing?</h2>
          <p className="text-gray-400 text-lg mb-8">
            Two minutes to set up. No app. No dashboard. Just answers.
          </p>
          <Link
            href="/onboard"
            className="inline-block bg-[#6366f1] hover:bg-[#4f46e5] text-white px-10 py-4 rounded-xl font-semibold text-lg transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1f2937] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#6366f1] rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">P</span>
            </div>
            <span className="text-gray-400 text-sm">Planner by Micro Titan LLC</span>
          </div>
          <p className="text-gray-600 text-xs">
            &copy; {new Date().getFullYear()} Micro Titan LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
