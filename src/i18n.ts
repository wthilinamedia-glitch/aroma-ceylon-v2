import { useEffect } from 'react'

export type AppLanguage = 'en' | 'si'

const dictionary: Record<string, string> = {
  'Dashboard': 'ප්‍රධාන පුවරුව',
  'Home': 'මුල් පිටුව',
  'Add income': 'ආදායම එක් කරන්න',
  'Add expense': 'වියදම එක් කරන්න',
  'Approvals': 'අනුමැති',
  'Transactions': 'ගනුදෙනු',
  'Employees': 'සේවකයින්',
  'Attendance': 'පැමිණීම',
  'Payroll': 'වැටුප්',
  'Products': 'නිෂ්පාදන',
  'Shops': 'වෙළඳසැල්',
  'Sales': 'විකුණුම්',
  'Messages': 'පණිවිඩ',
  'Inventory': 'තොග',
  'Reports': 'වාර්තා',
  'Sign out': 'පිටවන්න',
  'Administrator': 'පරිපාලක',
  'Team Member': 'කණ්ඩායම් සාමාජික',
  'Total income': 'මුළු ආදායම',
  'Approved expenses': 'අනුමත වියදම්',
  'Net profit / loss': 'ශුද්ධ ලාභය / අලාභය',
  'Pending approval': 'අනුමැතිය බලාපොරොත්තුවෙන්',
  'Current profit': 'වත්මන් ලාභය',
  'Current loss': 'වත්මන් අලාභය',
  'Loading records…': 'වාර්තා පූරණය වෙමින්…',
  'Loading employees…': 'සේවකයින් පූරණය වෙමින්…',
  'Loading attendance…': 'පැමිණීම් පූරණය වෙමින්…',
  'Loading payroll…': 'වැටුප් පූරණය වෙමින්…',
  'Loading products…': 'නිෂ්පාදන පූරණය වෙමින්…',
  'Loading shops…': 'වෙළඳසැල් පූරණය වෙමින්…',
  'Loading sales workspace…': 'විකුණුම් පද්ධතිය පූරණය වෙමින්…',
  'Loading payslips…': 'වැටුප් පත්‍ර පූරණය වෙමින්…',
  'Save': 'සුරකින්න',
  'Save changes': 'වෙනස්කම් සුරකින්න',
  'Save draft': 'කෙටුම්පත සුරකින්න',
  'Cancel': 'අවලංගු කරන්න',
  'Edit': 'සංස්කරණය',
  'Delete': 'මකන්න',
  'Archive': 'සංරක්ෂිත කරන්න',
  'Restore': 'නැවත සක්‍රීය කරන්න',
  'Search': 'සොයන්න',
  'Active': 'සක්‍රීය',
  'Archived': 'සංරක්ෂිත',
  'All': 'සියල්ල',
  'Paid': 'ගෙවා ඇත',
  'Partially paid': 'කොටසක් ගෙවා ඇත',
  'Unpaid': 'ගෙවා නැත',
  'Overdue': 'කල් ඉකුත්',
  'Draft': 'කෙටුම්පත',
  'Sent': 'යවා ඇත',
  'Delivered': 'භාරදී ඇත',
  'Pending': 'බලාපොරොත්තුවෙන්',
  'Approved': 'අනුමතයි',
  'Rejected': 'ප්‍රතික්ෂේපයි',
  'Download PDF': 'PDF බාගන්න',
  'My Payslips': 'මගේ වැටුප් පත්‍ර',
  'My Attendance': 'මගේ පැමිණීම',
  'My Expenses': 'මගේ වියදම්',
  'My Profile': 'මගේ පැතිකඩ',
  'Submit Expense': 'වියදමක් ඉදිරිපත් කරන්න',
  'Contact Admin': 'පරිපාලක අමතන්න',
  'New Message': 'නව පණිවිඩයක්',
  'Suggestion': 'යෝජනාව',
  'Complaint': 'පැමිණිල්ල',
  'Issue': 'ගැටලුව',
  'Other': 'වෙනත්',
  'Reply': 'පිළිතුරු දෙන්න',
  'Mark as resolved': 'විසඳා අවසන් ලෙස සලකුණු කරන්න',
  'Announcement': 'නිවේදනය',
  'Unread': 'නොකියවූ',
  'Confidential': 'රහස්‍ය',
  'Subject': 'මාතෘකාව',
  'Message': 'පණිවිඩය',
  'Send': 'යවන්න',
  'Attachment': 'ඇමුණුම',
  'Private message': 'පුද්ගලික පණිවිඩය',
  'Selected employees': 'තෝරාගත් සේවකයින්',
  'All employees': 'සියලු සේවකයින්',
  'Language': 'භාෂාව',
  'English': 'English',
  'Sinhala': 'සිංහල',
  'Stock on hand': 'පවතින තොගය',
  'Low stock': 'අඩු තොග',
  'Reorder level': 'නැවත ඇණවුම් මට්ටම',
  'Stock adjustment': 'තොග සංශෝධනය',
  'Monthly sales': 'මාසික විකුණුම්',
  'Outstanding invoices': 'ගෙවීමට ඉතිරි ඉන්වොයිස්',
  'Gross profit': 'දළ ලාභය',
  'Payment receipt': 'ගෙවීම් රිසිට්පත',
  'Credit note': 'ණය සටහන',
  'Refund': 'මුදල් ආපසු ගෙවීම',
}

export function t(text: string, language: AppLanguage) {
  return language === 'si' ? dictionary[text] || text : text
}

const originalText = new WeakMap<Node, string>()

export function useAutoTranslate(language: AppLanguage) {
  useEffect(() => {
    document.documentElement.lang = language === 'si' ? 'si' : 'en'
    const translateNode = (node: Node) => {
      if (node.nodeType !== Node.TEXT_NODE) return
      const parent = node.parentElement
      if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return
      const raw = node.textContent || ''
      const trimmed = raw.trim()
      if (!trimmed) return
      if (!originalText.has(node)) originalText.set(node, raw)
      const base = originalText.get(node) || raw
      const baseTrimmed = base.trim()
      const translated = language === 'si' ? dictionary[baseTrimmed] : baseTrimmed
      if (translated && translated !== baseTrimmed) {
        const prefix = base.slice(0, base.indexOf(baseTrimmed))
        const suffix = base.slice(base.indexOf(baseTrimmed) + baseTrimmed.length)
        node.textContent = `${prefix}${translated}${suffix}`
      } else if (language === 'en') {
        node.textContent = base
      }
    }

    const walk = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let current: Node | null = walker.nextNode()
      while (current) {
        translateNode(current)
        current = walker.nextNode()
      }
      if (root instanceof HTMLElement) {
        root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]').forEach((element) => {
          const english = element.dataset.englishPlaceholder || element.placeholder
          element.dataset.englishPlaceholder = english
          element.placeholder = language === 'si' ? dictionary[english] || english : english
        })
      }
    }

    walk(document.body)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach(walk))
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [language])
}
