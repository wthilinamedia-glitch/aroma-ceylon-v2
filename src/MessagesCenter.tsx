import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { AppLanguage } from './i18n'
import { t } from './i18n'

type Role = 'admin' | 'user'
type Profile = { id: string; full_name: string; email: string | null; role: Role; active: boolean }
type ThreadStatus = 'open' | 'read' | 'replied' | 'resolved' | 'archived'
type Thread = {
  id: string
  sender_id: string
  subject: string
  category: string
  audience: string
  confidential: boolean
  status: ThreadStatus
  created_at: string
  updated_at: string
}
type Message = { id: string; thread_id: string; sender_id: string; body: string; attachment_path: string | null; created_at: string }
type Recipient = { thread_id: string; recipient_id: string; read_at: string | null; archived_at?: string | null }

type MessagesCenterProps = {
  profile: Profile
  profiles: Profile[]
  language: AppLanguage
  onUnreadChanged?: () => void | Promise<void>
}

const allowedAttachmentTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
])

function displayDate(value: string, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === 'si' ? 'si-LK' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function MessagesCenter({ profile, profiles, language, onUnreadChanged }: MessagesCenterProps) {
  const isAdmin = profile.role === 'admin'
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('Suggestion')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [audience, setAudience] = useState<'private' | 'selected' | 'all'>('private')
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [attachment, setAttachment] = useState<File | null>(null)
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const names = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.full_name || item.email || 'User'])),
    [profiles],
  )
  const selected = threads.find((thread) => thread.id === selectedId) || null
  const selectedMessages = messages.filter((item) => item.thread_id === selectedId)
  const selectedRecipients = recipients.filter((item) => item.thread_id === selectedId && item.recipient_id !== profile.id)
  const visibleThreads = threads.filter((thread) => showArchived ? thread.status === 'archived' : thread.status !== 'archived')

  const load = useCallback(async () => {
    setLoading(true)
    const [threadResult, messageResult, recipientResult] = await Promise.all([
      supabase.from('message_threads').select('*').order('updated_at', { ascending: false }),
      supabase.from('thread_messages').select('*').order('created_at'),
      supabase.from('message_recipients').select('thread_id,recipient_id,read_at,archived_at'),
    ])
    if (threadResult.error || messageResult.error || recipientResult.error) {
      setError(threadResult.error?.message || messageResult.error?.message || recipientResult.error?.message || 'Unable to load messages.')
      setLoading(false)
      return
    }
    setThreads((threadResult.data || []) as Thread[])
    setMessages((messageResult.data || []) as Message[])
    setRecipients((recipientResult.data || []) as Recipient[])
    setLoading(false)
    await onUnreadChanged?.()
  }, [onUnreadChanged])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`aroma-messages-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_threads' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thread_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_recipients' }, load)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, profile.id])

  function validateAttachment(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error('Attachment must be 10 MB or smaller.')
    if (!allowedAttachmentTypes.has(file.type)) throw new Error('Use a JPG, PNG, WebP, PDF or text attachment.')
  }

  async function upload(file: File, threadId: string) {
    validateAttachment(file)
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = `${profile.id}/${threadId}/${Date.now()}-${safe}`
    const { error: uploadError } = await supabase.storage
      .from('message-attachments')
      .upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) throw uploadError
    return path
  }

  async function createThread(event: FormEvent) {
    event.preventDefault()
    if (!subject.trim() || !body.trim()) return setError('Subject and message are required.')
    setBusy(true)
    setError('')
    setNotice('')
    let createdThreadId: string | null = null
    let uploadedPath: string | null = null
    let firstMessageCreated = false
    try {
      let recipientIds: string[] = []
      if (isAdmin) {
        if (audience === 'all') {
          recipientIds = profiles.filter((item) => item.role === 'user' && item.active).map((item) => item.id)
        } else {
          recipientIds = audience === 'private' ? selectedEmployees.slice(0, 1) : [...new Set(selectedEmployees)]
        }
        if (!recipientIds.length) throw new Error('Select at least one employee.')
      }

      const threadId = crypto.randomUUID()
      createdThreadId = threadId
      const threadCategory = isAdmin && audience === 'all' ? 'Announcement' : isAdmin ? 'Other' : category
      const { error: threadError } = await supabase.from('message_threads').insert({
        id: threadId,
        sender_id: profile.id,
        subject: subject.trim(),
        category: threadCategory,
        confidential: threadCategory === 'Complaint',
        status: 'open',
        audience: isAdmin ? audience : 'admin',
      })
      if (threadError) throw threadError

      if (isAdmin) {
        const { error: recipientError } = await supabase
          .from('message_recipients')
          .insert(recipientIds.map((id) => ({ thread_id: threadId, recipient_id: id })))
        if (recipientError) throw recipientError
      } else {
        const { error: recipientError } = await supabase.rpc('add_admin_message_recipient', { p_thread_id: threadId })
        if (recipientError) throw recipientError
      }

      if (attachment) uploadedPath = await upload(attachment, threadId)
      const { error: messageError } = await supabase.from('thread_messages').insert({
        thread_id: threadId,
        sender_id: profile.id,
        body: body.trim(),
        attachment_path: uploadedPath,
      })
      if (messageError) throw messageError
      firstMessageCreated = true

      setSubject('')
      setBody('')
      setAttachment(null)
      setSelectedEmployees([])
      setNotice('Message sent successfully.')
      await load()
      setSelectedId(threadId)
    } catch (caught) {
      if (createdThreadId && !firstMessageCreated) {
        if (uploadedPath) await supabase.storage.from('message-attachments').remove([uploadedPath])
        await supabase.rpc('delete_empty_message_thread', { p_thread_id: createdThreadId })
      }
      setError(caught instanceof Error ? caught.message : 'Unable to send message.')
    } finally {
      setBusy(false)
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault()
    if (!selected || !reply.trim() || selected.status === 'resolved' || selected.status === 'archived') return
    setBusy(true)
    setError('')
    let uploadedPath: string | null = null
    try {
      if (replyAttachment) uploadedPath = await upload(replyAttachment, selected.id)
      const { error: replyError } = await supabase.from('thread_messages').insert({
        thread_id: selected.id,
        sender_id: profile.id,
        body: reply.trim(),
        attachment_path: uploadedPath,
      })
      if (replyError) throw replyError
      setReply('')
      setReplyAttachment(null)
      await load()
    } catch (caught) {
      if (uploadedPath) await supabase.storage.from('message-attachments').remove([uploadedPath])
      setError(caught instanceof Error ? caught.message : 'Unable to send reply.')
    } finally {
      setBusy(false)
    }
  }

  async function setThreadStatus(status: ThreadStatus) {
    if (!selected || !isAdmin) return
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase
      .from('message_threads')
      .update({ status })
      .eq('id', selected.id)
    if (updateError) setError(updateError.message)
    else {
      if (status === 'archived') setSelectedId(null)
      await load()
    }
    setBusy(false)
  }

  async function openThread(thread: Thread) {
    setSelectedId(thread.id)
    const { error: readError } = await supabase
      .from('message_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', thread.id)
      .eq('recipient_id', profile.id)
    if (readError) setError(readError.message)
    await load()
  }

  async function downloadAttachment(path: string) {
    const { data, error: signedError } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(path, 120)
    if (signedError) return setError(signedError.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const unread = (threadId: string) => recipients.some(
    (item) => item.thread_id === threadId && item.recipient_id === profile.id && !item.read_at,
  )

  return <div className="messages-layout">
    <section className="content-card form-card">
      <div className="card-title-row">
        <div>
          <p className="eyebrow">{isAdmin ? 'TEAM COMMUNICATIONS' : 'CONTACT ADMIN'}</p>
          <h2>{t('New Message', language)}</h2>
        </div>
      </div>
      <form className="compact-form" onSubmit={createThread}>
        {isAdmin && <label>{t('Audience', language)}
          <select value={audience} onChange={(event) => { setAudience(event.target.value as typeof audience); setSelectedEmployees([]) }}>
            <option value="private">{t('Private message', language)}</option>
            <option value="selected">{t('Selected employees', language)}</option>
            <option value="all">{t('All employees', language)}</option>
          </select>
        </label>}
        {isAdmin && audience === 'private' && <label>{t('Employees', language)}
          <select value={selectedEmployees[0] || ''} onChange={(event) => setSelectedEmployees(event.target.value ? [event.target.value] : [])}>
            <option value="">Select employee</option>
            {profiles.filter((item) => item.role === 'user' && item.active).map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.full_name || employee.email}</option>
            ))}
          </select>
        </label>}
        {isAdmin && audience === 'selected' && <fieldset className="employee-picker">
          <legend>{t('Employees', language)}</legend>
          {profiles.filter((item) => item.role === 'user' && item.active).map((employee) => <label key={employee.id}>
            <input
              type="checkbox"
              checked={selectedEmployees.includes(employee.id)}
              onChange={(event) => setSelectedEmployees((current) => event.target.checked
                ? [...new Set([...current, employee.id])]
                : current.filter((id) => id !== employee.id))}
            />
            {employee.full_name || employee.email}
          </label>)}
        </fieldset>}
        {!isAdmin && <label>{t('Category', language)}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>Suggestion</option>
            <option>Complaint</option>
            <option>Issue</option>
            <option>Leave / service request</option>
            <option>Other</option>
          </select>
        </label>}
        <label>{t('Subject', language)}<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required /></label>
        <label>{t('Message', language)}<textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} required /></label>
        <label>{t('Attachment', language)}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" onChange={(event) => setAttachment(event.target.files?.[0] || null)} />
          <small>JPG, PNG, WebP, PDF or text · maximum 10 MB</small>
        </label>
        <button className="primary-button" disabled={busy}>{busy ? 'Sending…' : t('Send', language)}</button>
      </form>
      {notice && <p className="form-message">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
    </section>

    <section className="content-card messages-inbox">
      <div className="card-title-row">
        <div><p className="eyebrow">INBOX</p><h2>{t('Messages', language)}</h2></div>
        <div className="messages-toolbar">
          <span className="status-pill">{threads.filter((item) => unread(item.id)).length} {t('Unread', language)}</span>
          {isAdmin && <button className="small-button" type="button" onClick={() => { setShowArchived((value) => !value); setSelectedId(null) }}>{showArchived ? 'Open messages' : 'Archived'}</button>}
        </div>
      </div>
      {loading ? <div className="empty-state">Loading messages…</div> : !visibleThreads.length ? <div className="empty-state">No messages yet.</div> : (
        <div className="message-thread-list">{visibleThreads.map((thread) => <button
          key={thread.id}
          type="button"
          className={`message-thread ${selectedId === thread.id ? 'active' : ''}`}
          onClick={() => openThread(thread)}
        >
          <span>{thread.category}{thread.confidential ? ` · ${t('Confidential', language)}` : ''}</span>
          <strong>{thread.subject}</strong>
          <small>{names.get(thread.sender_id) || (thread.sender_id === profile.id ? profile.full_name : 'Administrator')} · {displayDate(thread.updated_at || thread.created_at, language)}</small>
          {unread(thread.id) && <i />}
        </button>)}</div>
      )}

      {selected && <div className="conversation-panel">
        <div className="conversation-heading">
          <div>
            <strong>{selected.subject}</strong>
            <small>{selected.status}</small>
            {isAdmin && selectedRecipients.length > 0 && <small>To: {selectedRecipients.map((item) => names.get(item.recipient_id) || 'Employee').join(', ')}</small>}
          </div>
          {isAdmin && <div className="message-status-actions">
            {selected.status === 'resolved'
              ? <button className="outline-button" type="button" disabled={busy} onClick={() => setThreadStatus('open')}>Reopen</button>
              : selected.status !== 'archived' && <button className="outline-button" type="button" disabled={busy} onClick={() => setThreadStatus('resolved')}>{t('Mark as resolved', language)}</button>}
            {selected.status !== 'archived' && <button className="small-button" type="button" disabled={busy} onClick={() => setThreadStatus('archived')}>{t('Archive', language)}</button>}
          </div>}
        </div>
        {selectedMessages.map((item) => <article className={`chat-bubble ${item.sender_id === profile.id ? 'mine' : ''}`} key={item.id}>
          <strong>{names.get(item.sender_id) || (item.sender_id === profile.id ? profile.full_name : 'Administrator')}</strong>
          <p data-no-translate="true">{item.body}</p>
          {item.attachment_path && <button className="text-button" type="button" onClick={() => downloadAttachment(item.attachment_path as string)}>{t('Attachment', language)}</button>}
          <small>{displayDate(item.created_at, language)}</small>
        </article>)}
        {selected.status !== 'resolved' && selected.status !== 'archived' && <form className="reply-form" onSubmit={sendReply}>
          <textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t('Reply', language)} maxLength={10000} />
          <label className="reply-attachment-field">
            <span>{t('Attachment', language)} (optional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" onChange={(event) => setReplyAttachment(event.target.files?.[0] || null)} />
            {replyAttachment && <small>{replyAttachment.name}</small>}
          </label>
          <button className="primary-button" disabled={busy || !reply.trim()}>{t('Reply', language)}</button>
        </form>}
      </div>}
    </section>
  </div>
}
