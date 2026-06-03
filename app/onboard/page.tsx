'use client'

import { useState } from 'react'
import Link from 'next/link'

type Step = 'form' | 'submitting' | 'success' | 'error'

export default function OnboardPage() {
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStep('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone }),
      })

      const data = await res.json() as { success?: boolean; error?: string; message?: string }

      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong. Try again.')
        setStep('error')
        return
      }

      setStep('success')
    } catch {
      setErrorMsg('Network error. Check your connection and try again.')
      setStep('error')
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">You&apos;re in!</h1>
          <p className="text-gray-400 text-lg mb-2">
            Check your phone — I just texted you.
          </p>
          <p className="text-gray-500 text-sm mb-8">
            (And I&apos;ll text again in 2 minutes with one quick setup question.)
          </p>
          <div className="bg-[#1c2333] border border-[#2d3748] rounded-2xl p-6 text-left">
            <p className="text-sm text-gray-400 mb-3">Try texting me:</p>
            <ul className="space-y-2">
              {[
                '"How much have I spent this month?"',
                '"Am I on track to save $500?"',
                '"Help me budget for this weekend."',
              ].map(q => (
                <li key={q} className="text-sm text-[#818cf8] font-mono bg-[#111827] rounded-lg px-3 py-2">
                  {q}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/"
            className="inline-block mt-6 text-gray-400 hover:text-white text-sm transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#6366f1] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-bold text-lg text-white">Planner</span>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Get started in 2 minutes.</h1>
          <p className="text-gray-400">Three questions. Then I&apos;ll text you.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your first name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Alex"
              required
              disabled={step === 'submitting'}
              className="w-full bg-[#1c2333] border border-[#2d3748] focus:border-[#6366f1] text-white placeholder-gray-500 rounded-xl px-4 py-3.5 outline-none transition-colors text-base"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="alex@example.com"
              required
              disabled={step === 'submitting'}
              className="w-full bg-[#1c2333] border border-[#2d3748] focus:border-[#6366f1] text-white placeholder-gray-500 rounded-xl px-4 py-3.5 outline-none transition-colors text-base"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your mobile number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 867-5309"
              required
              disabled={step === 'submitting'}
              className="w-full bg-[#1c2333] border border-[#2d3748] focus:border-[#6366f1] text-white placeholder-gray-500 rounded-xl px-4 py-3.5 outline-none transition-colors text-base"
            />
            <p className="text-xs text-gray-500 mt-1.5">US numbers only. Standard messaging rates apply.</p>
          </div>

          {/* Error */}
          {step === 'error' && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={step === 'submitting'}
            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2"
          >
            {step === 'submitting' ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Setting you up...
              </>
            ) : (
              'Text Me My Assistant'
            )}
          </button>
        </form>

        {/* Trust */}
        <div className="flex items-center gap-6 mt-8 justify-center">
          {['No app required', 'Cancel anytime', 'US only (for now)'].map(item => (
            <span key={item} className="text-xs text-gray-500 flex items-center gap-1">
              <span className="text-[#6366f1]">&#10003;</span> {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
