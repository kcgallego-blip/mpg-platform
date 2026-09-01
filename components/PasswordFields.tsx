'use client'

import { useState } from 'react'
import { CheckCircle, Eye, EyeOff, Lock, XCircle } from 'lucide-react'
import { evaluatePassword, MIN_PASSWORD_LENGTH } from '@/lib/passwordPolicy'

type PasswordFieldsProps = {
  password: string
  confirmPassword: string
  onPasswordChange: (value: string) => void
  onConfirmPasswordChange: (value: string) => void
  disabled?: boolean
  passwordLabel?: string
  confirmLabel?: string
  autoFocus?: boolean
}

export default function PasswordFields({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  disabled = false,
  passwordLabel = 'Password',
  confirmLabel = 'Confirm password',
  autoFocus = false,
}: PasswordFieldsProps) {
  const evaluation = evaluatePassword(password)
  const confirmationMatches = confirmPassword.length > 0 && password === confirmPassword

  return (
    <div className="space-y-4">
      <PasswordInput
        id="password"
        label={passwordLabel}
        value={password}
        onChange={onPasswordChange}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="new-password"
      />

      <div aria-live="polite" className="space-y-3 rounded-lg bg-surface-container-low/50 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-on-surface">Password strength</span>
          <span className="capitalize text-on-surface-variant">
            {evaluation.strength === 'empty' ? 'Not entered' : evaluation.strength}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5" role="meter" aria-valuemin={0} aria-valuemax={4} aria-valuenow={evaluation.score}>
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={`h-1.5 rounded-full ${evaluation.score >= level ? 'bg-primary' : 'bg-outline-variant/30'}`}
            />
          ))}
        </div>
        <ul className="grid gap-1.5 text-xs text-on-surface-variant sm:grid-cols-2">
          <Requirement met={evaluation.lengthValid} label={`${MIN_PASSWORD_LENGTH}+ characters`} />
          <Requirement met={evaluation.characterTypesValid} label={`${evaluation.characterTypeCount}/3 character types`} />
          <Requirement met={evaluation.hasLowercase} label="Lowercase letter" />
          <Requirement met={evaluation.hasUppercase} label="Uppercase letter" />
          <Requirement met={evaluation.hasNumber} label="Number" />
          <Requirement met={evaluation.hasSymbol} label="Symbol" />
        </ul>
      </div>

      <PasswordInput
        id="confirm-password"
        label={confirmLabel}
        value={confirmPassword}
        onChange={onConfirmPasswordChange}
        disabled={disabled}
        autoComplete="new-password"
      />

      {confirmPassword.length > 0 && (
        <p className={`flex items-center gap-1.5 text-xs ${confirmationMatches ? 'text-success' : 'text-error'}`}>
          {confirmationMatches ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {confirmationMatches ? 'Passwords match' : 'Passwords do not match'}
        </p>
      )}
    </div>
  )
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${met ? 'text-success' : ''}`}>
      {met ? <CheckCircle size={13} /> : <XCircle size={13} />}
      {label}
    </li>
  )
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  disabled,
  autoFocus,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  autoFocus?: boolean
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-label-sm font-medium text-on-surface">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="Enter password"
          className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container-low/50 py-sm pl-10 pr-12 text-on-surface placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface disabled:opacity-50"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}
