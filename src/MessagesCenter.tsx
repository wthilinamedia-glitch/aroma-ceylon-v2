import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { AppLanguage } from './i18n'
import { t } from './i18n'

type Role = 'admin' | 'user'
type Profile = { id: string; full_name: string; email: string | null; role: Role; active: boolean }
type Thread = { id: string; sender_id: string; subject: string; category: string; confidential: boolean; status: string; created_at: string; updated_at: string }
type Message = { id: string; thread_id: string; sender_id: string; body: string; attachment_path: string | null; created_at: string }
type Recipient = { thread_id: string; recipient_id: string; read_at: string | null }

export function MessagesCenter({ profile, profiles, language }: { profile: Profile; profiles: Profile[]; language: AppLanguage }) {
  const isAdmin = profile.role === 'admin'
  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('Suggestion')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [audience, setAudience] = useState<'private' | 'selected' | 'all'>(isAdmin ? 'private' : 'private')
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [attachment, setAttachment] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const names = useMemo(() => new Map(profiles.map((item) => [item.id, item.full_name || item.email || 'User'])), [profiles])
  const selected = threads.find((thread) => thread.id === selectedId) || null
  const selectedMessages = messages.filter((item) => item.thread_id === selectedId)

  const load = useCallback(async () => {
    const [threadResult, messageResult, recipientResult] = await Promise.all([
      supabase.from('message_threads').select('*').order('updated_at', { ascending: false }),
      supabase.from('thread_messages').select('*').order('created_at'),
      supabase.from('message_recipients').select('thread_id,recipient_id,read_at'),
    ])
    if (threadResult.error || messageResult.error || recipientResult.error) {
      setError(threadResult.error?.message || messageResult.error?.message || recipientResult.error?.message || 'Unable to load messages.')
      return
    }
    setThreads((threadResult.data || []) as Thread[])
    setMessages((messageResult.data || []) as Message[])
    setRecipients((recipientResult.data || []) as Recipient[])
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(file: File, threadId: string) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = `${profile.id}/${threadId}/${Date.now()}-${safe}`
    const { error: uploadError } = await supabase.storage.from('message-attachments').upload(path, file, { upsert: false })
    if (uploadError) throw uploadError
    return path
  }

  async function createThread(event: FormEvent) {
    event.preventDefault()
    if (!subject.trim() || !body.trim()) return setError('Subject and message are required.')
    setBusy(true); setError(''); setNotice('')
    try {
      let ids: string[] = []
      if (isAdmin) {
        if (audience === 'all') ids = profiles.filter((item) => item.role === 'user' && item.active).map((item) => item.id)
        else ids = audience === 'private' ? selectedEmployees.slice(0, 1) : selectedEmployees
        if (!ids.length) throw new Error('Select at least one employee.')
      }
      const threadId = crypto.randomUUID()
      const threadCategory = isAdmin && audience === 'all' ? 'Announcement' : category
      const { error: threadError } = await supabase.from('message_threads').insert({
        id: threadId, sender_id: profile.id, subject: subject.trim(), category: threadCategory,
        confidential: threadCategory === 'Complaint', status: 'open', audience: isAdmin ? audience : 'admin',
      })
      if (threadError) throw threadError
      const path = attachment ? await upload(attachment, threadId) : null
      const { error: messageError } = await supabase.from('thread_messages').insert({ thread_id: threadId, sender_id: profile.id, body: body.trim(), attachment_path: path })
      if (messageError) throw messageError
      if (isAdmin) {
        const { error: recipientError } = await supabase.from('message_recipients').insert(ids.map((id) => ({ thread_id: threadId, recipient_id: id })))
        if (recipientError) throw recipientError
      } else {
        const { error: recipientError } = await supabase.rpc('add_admin_message_recipient', { p_thread_id: threadId })
        if (recipientError) throw recipientError
      }
      setSubject(''); setBody(''); setAttachment(null); setSelectedEmployees([]); setNotice('Message sent successfully.')
      await load(); setSelectedId(threadId)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to send message.') }
    setBusy(false)
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault()
    if (!selected || !reply.trim()) return
    setBusy(true); setError('')
    const { error: replyError } = await supabase.from('thread_messages').insert({ thread_id: selected.id, sender_id: profile.id, body: reply.trim() })
    if (replyError) setError(replyError.message)
    else { setReply(''); await supabase.from('message_threads').update({ status: 'replied' }).eq('id', selected.id); await load() }
    setBusy(false)
  }

  async function markResolved() {
    if (!selected) return
    const { error: updateError } = await supabase.from('message_threads').update({ status: 'resolved' }).eq('id', selected.id)
    if (updateError) setError(updateError.message); else await load()
  }

  async function openThread(thread: Thread) {
    setSelectedId(thread.id)
    await supabase.from('message_recipients').update({ read_at: new Date().toISOString() }).eq('thread_id', thread.id).eq('recipient_id', profile.id)
    load()
  }

  async function downloadAttachment(path: string) {
    const { data, error: signedError } = await supabase.storage.from('message-attachments').createSignedUrl(path, 120)
    if (signedError) return setError(signedError.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const unread = (threadId: string) => recipients.some((item) => item.thread_id === threadId && item.recipient_id === profile.id && !item.read_at)

  return <div className="messages-layout">
    <section className="content-card form-card">
      <div className="card-title-row"><div><p className="eyebrow">{isAdmin ? 'TEAM COMMUNICATIONS' : 'CONTACT ADMIN'}</p><h2>{t('New Message', language)}</h2></div></div>
      <form className="compact-form" onSubmit={createThread}>
        {isAdmin && <label>{t('Audience', language)}<select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}><option value="private">{t('Private message', language)}</option><option value="selected">{t('Selected employees', language)}</option><option value="all">{t('All employees', language)}</option></select></label>}
        {isAdmin && audience === 'private' && <label>{t('Employees', language)}<select value={selectedEmployees[0] || ''} onChange={(e) => setSelectedEmployees(e.target.value ? [e.target.value] : [])}><option value="">Select employee</option>{profiles.filter((item) => item.role === 'user' && item.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name || employee.email}</option>)}</select></label>}
        {isAdmin && audience === 'selected' && <fieldset className="employee-picker"><legend>{t('Employees', language)}</legend>{profiles.filter((item) => item.role === 'user' && item.active).map((employee) => <label key={employee.id}><input type="checkbox" checked={selectedEmployees.includes(employee.id)} onChange={(e) => setSelectedEmployees((current) => e.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))} />{employee.full_name || employee.email}</label>)}</fieldset>}
        {!isAdmin && <label>{t('Category', language)}<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Suggestion</option><option>Complaint</option><option>Issue</option><option>Leave / service request</option><option>Other</option></select></label>}
        <label>{t('Subject', language)}<input value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
        <label>{t('Message', language)}<textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        <label>{t('Attachment', language)}<input type="file" onChange={(e) => setAttachment(e.target.files?.[0] || null)} /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Sending…' : t('Send', language)}</button>
      </form>
      {notice && <p className="form-message">{notice}</p>}{error && <p className="form-error">{error}</p>}
    </section>

    <section className="content-card messages-inbox">
      <div className="card-title-row"><div><p className="eyebrow">INBOX</p><h2>{t('Messages', language)}</h2></div><span className="status-pill">{threads.filter((item) => unread(item.id)).length} {t('Unread', language)}</span></div>
      {!threads.length ? <div className="empty-state">No messages yet.</div> : <div className="message-thread-list">{threads.map((thread) => <button key={thread.id} className={`message-thread ${selectedId === thread.id ? 'active' : ''}`} onClick={() => openThread(thread)}><span>{thread.category}{thread.confidential ? ` · ${t('Confidential', language)}` : ''}</span><strong>{thread.subject}</strong><small>{names.get(thread.sender_id) || (thread.sender_id === profile.id ? profile.full_name : 'Administrator')} · {new Date(thread.created_at).toLocaleString()}</small>{unread(thread.id) && <i />}</button>)}</div>}
      {selected && <div className="conversation-panel"><div className="conversation-heading"><div><strong>{selected.subject}</strong><small>{selected.status}</small></div>{isAdmin && selected.status !== 'resolved' && <button className="outline-button" onClick={markResolved}>{t('Mark as resolved', language)}</button>}</div>{selectedMessages.map((item) => <article className={`chat-bubble ${item.sender_id === profile.id ? 'mine' : ''}`} key={item.id}><strong>{names.get(item.sender_id) || (item.sender_id === profile.id ? profile.full_name : 'Administrator')}</strong><p>{item.body}</p>{item.attachment_path && <button className="text-button" onClick={() => downloadAttachment(item.attachment_path as string)}>{t('Attachment', language)}</button>}<small>{new Date(item.created_at).toLocaleString()}</small></article>)}<form className="reply-form" onSubmit={sendReply}><textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('Reply', language)} /><button className="primary-button" disabled={busy}>{t('Reply', language)}</button></form></div>}
    </section>
  </div>
}
