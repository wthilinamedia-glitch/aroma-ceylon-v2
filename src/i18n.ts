import { useEffect } from 'react'

export type AppLanguage = 'en' | 'si'

export const dictionary: Record<string, string> = {
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
  'Language': 'භාෂාව',
  'English': 'English',
  'Sinhala': 'සිංහල',
  'Total income': 'මුළු ආදායම',
  'Approved expenses': 'අනුමත වියදම්',
  'Net profit / loss': 'ශුද්ධ ලාභය / අලාභය',
  'Pending approval': 'අනුමැතිය බලාපොරොත්තුවෙන්',
  'Current profit': 'වත්මන් ලාභය',
  'Current loss': 'වත්මන් අලාභය',
  'Pending expenses': 'අනුමැතිය බලාපොරොත්තුවෙන් ඇති වියදම්',
  'Present this month': 'මේ මාසයේ පැමිණි දින',
  'Monthly salary': 'මාසික වැටුප',
  'My workspace': 'මගේ වැඩ අවකාශය',
  'Submit expense': 'වියදමක් ඉදිරිපත් කරන්න',
  'My expenses': 'මගේ වියදම්',
  'My attendance': 'මගේ පැමිණීම',
  'My payslips': 'මගේ වැටුප් පත්‍ර',
  'My profile': 'මගේ පැතිකඩ',
  'Contact admin': 'පරිපාලක අමතන්න',
  'Contact Admin': 'පරිපාලක අමතන්න',
  'Back to my home': 'මගේ මුල් පිටුවට ආපසු',
  'Loading secure workspace…': 'ආරක්ෂිත වැඩ අවකාශය පූරණය වෙමින්…',
  'Loading records…': 'වාර්තා පූරණය වෙමින්…',
  'Loading employees…': 'සේවකයින් පූරණය වෙමින්…',
  'Loading attendance…': 'පැමිණීම් පූරණය වෙමින්…',
  'Loading payroll…': 'වැටුප් පූරණය වෙමින්…',
  'Loading products…': 'නිෂ්පාදන පූරණය වෙමින්…',
  'Loading shops…': 'වෙළඳසැල් පූරණය වෙමින්…',
  'Loading sales workspace…': 'විකුණුම් පද්ධතිය පූරණය වෙමින්…',
  'Loading messages…': 'පණිවිඩ පූරණය වෙමින්…',
  'Loading inventory…': 'තොග පූරණය වෙමින්…',
  'Loading reports…': 'වාර්තා පූරණය වෙමින්…',
  'Loading payslips…': 'වැටුප් පත්‍ර පූරණය වෙමින්…',
  'Save': 'සුරකින්න',
  'Save changes': 'වෙනස්කම් සුරකින්න',
  'Save draft': 'කෙටුම්පත සුරකින්න',
  'Save payment': 'ගෙවීම සුරකින්න',
  'Cancel': 'අවලංගු කරන්න',
  'Close': 'වසන්න',
  'Edit': 'සංස්කරණය',
  'Delete': 'මකන්න',
  'Reverse payment': 'ගෙවීම ආපසු හැරවන්න',
  'Reversing…': 'ගෙවීම ආපසු හරවමින්…',
  'Archive': 'සංරක්ෂිත කරන්න',
  'Restore': 'නැවත සක්‍රීය කරන්න',
  'Search': 'සොයන්න',
  'Active': 'සක්‍රීය',
  'Inactive': 'අක්‍රීය',
  'Archived': 'සංරක්ෂිත',
  'All': 'සියල්ල',
  'Paid': 'ගෙවා ඇත',
  'Partially paid': 'කොටසක් ගෙවා ඇත',
  'Unpaid': 'ගෙවා නැත',
  'Overdue': 'කල් ඉකුත්',
  'Draft': 'කෙටුම්පත',
  'Sent': 'යවා ඇත',
  'Delivered': 'භාරදී ඇත',
  'Packed': 'ඇසුරුම් කර ඇත',
  'Pending': 'බලාපොරොත්තුවෙන්',
  'Approved': 'අනුමතයි',
  'Rejected': 'ප්‍රතික්ෂේපයි',
  'Download PDF': 'PDF බාගන්න',
  'Download invoice': 'ඉන්වොයිසය බාගන්න',
  'Download delivery note': 'බෙදාහැරීම් පත්‍රය බාගන්න',
  'Receipt PDF': 'රිසිට්පත් PDF',
  'Full name': 'සම්පූර්ණ නම',
  'Email': 'විද්‍යුත් තැපෑල',
  'Phone': 'දුරකථන අංකය',
  'Job title': 'තනතුර',
  'Account status': 'ගිණුම් තත්ත්වය',
  'Currency': 'මුදල් ඒකකය',
  'Category': 'වර්ගය',
  'Amount': 'මුදල',
  'Date': 'දිනය',
  'Notes': 'සටහන්',
  'Note': 'සටහන',
  'Expense name': 'වියදමේ නම',
  'Expense date': 'වියදම් දිනය',
  'Upload bill': 'බිල්පත එක් කරන්න',
  'View bill': 'බිල්පත බලන්න',
  'Income history': 'ආදායම් ඉතිහාසය',
  'Expense history': 'වියදම් ඉතිහාසය',
  'Received payments': 'ලැබුණු ගෙවීම්',
  'New Message': 'නව පණිවිඩයක්',
  'Suggestion': 'යෝජනාව',
  'Complaint': 'පැමිණිල්ල',
  'Issue': 'ගැටලුව',
  'Leave / service request': 'නිවාඩු / සේවා ඉල්ලීම',
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
  'Audience': 'ලබන්නන්',
  'Inbox': 'ලැබුණු පණිවිඩ',
  'No messages yet.': 'තවම පණිවිඩ නැහැ.',
  'Stock on hand': 'පවතින තොගය',
  'Low stock': 'අඩු තොග',
  'Reorder level': 'නැවත ඇණවුම් මට්ටම',
  'Stock adjustment': 'තොග සංශෝධනය',
  'Quantity': 'ප්‍රමාණය',
  'Reason': 'හේතුව',
  'Monthly sales': 'මාසික විකුණුම්',
  'Payments received': 'ලැබුණු ගෙවීම්',
  'Outstanding invoices': 'ගෙවීමට ඉතිරි ඉන්වොයිස්',
  'Outstanding by shop': 'වෙළඳසැල අනුව ගෙවීමට ඉතිරි මුදල්',
  'Gross profit': 'දළ ලාභය',
  'Realized gross profit': 'ලැබුණු දළ ලාභය',
  'Inventory cost value': 'තොග පිරිවැය වටිනාකම',
  'Payment receipt': 'ගෙවීම් රිසිට්පත',
  'Credit note': 'ණය සටහන',
  'Refund': 'මුදල් ආපසු ගෙවීම',
  'Issue credit note': 'ණය සටහන නිකුත් කරන්න',
  'Mark refunded': 'මුදල් ආපසු ගෙවූ ලෙස සලකුණු කරන්න',
  'Restore delivered stock': 'භාරදුන් තොගය නැවත එක් කරන්න',
  'Invoice': 'ඉන්වොයිසය',
  'Invoice date': 'ඉන්වොයිස් දිනය',
  'Due date': 'ගෙවීම් අවසන් දිනය',
  'Delivery date': 'බෙදාහැරීම් දිනය',
  'Delivery status': 'බෙදාහැරීම් තත්ත්වය',
  'Invoice status': 'ඉන්වොයිස් තත්ත්වය',
  'Products & quantities': 'නිෂ්පාදන සහ ප්‍රමාණ',
  'Unit price': 'ඒකක මිල',
  'Subtotal': 'අතුරු එකතුව',
  'Discount': 'වට්ටම',
  'Tax': 'බද්ද',
  'Total': 'මුළු එකතුව',
  'Balance': 'ඉතිරි මුදල',
  'Add payment': 'ගෙවීමක් එක් කරන්න',
  'Record payment': 'ගෙවීම සටහන් කරන්න',
  'Payment date': 'ගෙවීම් දිනය',
  'Method': 'ගෙවීම් ක්‍රමය',
  'Reference': 'යොමු අංකය',
  'Finalize & create PDFs': 'අවසන් කර PDF සාදන්න',
  'Mark packed': 'ඇසුරුම් කළ ලෙස සලකුණු කරන්න',
  'Mark delivered': 'භාරදුන් ලෙස සලකුණු කරන්න',
  'Refresh PDFs': 'PDF නැවත සාදන්න',
  'Basic salary': 'මූලික වැටුප',
  'Bonus': 'ප්‍රසාද දීමනාව',
  'Allowance': 'දීමනාව',
  'Deductions': 'අඩුකිරීම්',
  'Salary advance': 'වැටුප් අත්තිකාරම',
  'Net salary': 'ශුද්ධ වැටුප',
  'Present days': 'පැමිණි දින',
  'Half days': 'අර්ධ දින',
  'Absent days': 'නොපැමිණි දින',
  'Leave days': 'නිවාඩු දින',
  'MY WORKSPACE': 'මගේ වැඩ අවකාශය',
  'Your personal Aroma Ceylon workspace keeps expenses, attendance and salary information in one secure place.': 'ඔබගේ Aroma Ceylon වැඩ අවකාශය තුළ වියදම්, පැමිණීම සහ වැටුප් තොරතුරු ආරක්ෂිතව එක තැනක තබා ඇත.',
  'Add a business expense and optional bill photo.': 'ව්‍යාපාරික වියදමක් සහ අවශ්‍ය නම් බිල්පතේ ඡායාරූපයක් එක් කරන්න.',
  'Track pending, approved and rejected submissions.': 'බලාපොරොත්තුවෙන්, අනුමත සහ ප්‍රතික්ෂේප කළ වියදම් බලන්න.',
  'Monthly salary records will appear here.': 'මාසික වැටුප් වාර්තා මෙහි පෙන්වයි.',
  'Send a private message, suggestion, complaint or request.': 'පුද්ගලික පණිවිඩයක්, යෝජනාවක්, පැමිණිල්ලක් හෝ ඉල්ලීමක් යවන්න.',
  'View your job, contact and salary details.': 'ඔබගේ රැකියා, සම්බන්ධතා සහ වැටුප් විස්තර බලන්න.',
  'EXPENSE SUBMISSION': 'වියදම් ඉදිරිපත් කිරීම',
  'Add an expense': 'වියදමක් එක් කරන්න',
  'Amount (LKR)': 'මුදල (LKR)',
  'Note (optional)': 'සටහන (අවශ්‍ය නම්)',
  'Bill photo (optional)': 'බිල්පතේ ඡායාරූපය (අවශ්‍ය නම්)',
  'Take a photo or choose an image. It will be compressed before upload.': 'ඡායාරූපයක් ගන්න හෝ රූපයක් තෝරන්න. Upload කිරීමට පෙර එය සංකුචිත කරයි.',
  'Submitting…': 'ඉදිරිපත් කරමින්…',
  'Expense submitted for admin approval.': 'වියදම පරිපාලක අනුමැතිය සඳහා ඉදිරිපත් කරන ලදී.',
  'EMPLOYEE PROFILE': 'සේවක පැතිකඩ',
  'Contact the administrator when any information needs to be updated.': 'තොරතුරක් වෙනස් කළ යුතු නම් පරිපාලක අමතන්න.',
  'Not set': 'සඳහන් කර නැත',
  'SALARY HISTORY': 'වැටුප් ඉතිහාසය',
  'Finalized salary records and private PDF payslips are visible only to you and the administrator.': 'අවසන් කළ වැටුප් වාර්තා සහ පුද්ගලික PDF වැටුප් පත්‍ර ඔබට සහ පරිපාලකට පමණක් පෙනේ.',
  'Preparing…': 'සූදානම් කරමින්…',
  'MY ATTENDANCE': 'මගේ පැමිණීම',
  'Attendance calendar': 'පැමිණීමේ දින දර්ශනය',
  'Attendance is updated by your administrator.': 'පැමිණීමේ තොරතුරු පරිපාලක විසින් යාවත්කාලීන කරයි.',
  'Month': 'මාසය',
  'Half day': 'අර්ධ දිනය',
  'Open messages': 'විවෘත පණිවිඩ',
  'Reopen': 'නැවත විවෘත කරන්න',
  'Sending…': 'යවමින්…',
  'Select employee': 'සේවකයෙකු තෝරන්න',
  'Select at least one employee.': 'අවම වශයෙන් එක් සේවකයෙකු තෝරන්න.',
  'Message sent successfully.': 'පණිවිඩය සාර්ථකව යවන ලදී.',
  'JPG, PNG, WebP, PDF or text · maximum 10 MB': 'JPG, PNG, WebP, PDF හෝ text · උපරිම 10 MB',
  'Recent stock movements': 'මෑත තොග චලනයන්',
  'Returned products (optional)': 'ආපසු ලැබුණු නිෂ්පාදන (අවශ්‍ය නම්)',
  'Enter only the quantities physically returned.': 'ඇත්තටම ආපසු ලැබුණු ප්‍රමාණ පමණක් ඇතුළත් කරන්න.',
  'Issue credit note & PDF': 'ණය සටහන සහ PDF නිකුත් කරන්න',
  'Cancel credit': 'ණය සටහන අවලංගු කරන්න',
  'Best-selling products': 'වැඩියෙන්ම විකිණුණු නිෂ්පාදන',
  'Hello,': 'ආයුබෝවන්,',
  'ADMIN CONTROL CENTRE': 'පරිපාලක පාලන මධ්‍යස්ථානය',
  'TEAM COMMUNICATIONS': 'කණ්ඩායම් සන්නිවේදනය',
  'CONTACT ADMIN': 'පරිපාලක අමතන්න',
  'INBOX': 'ලැබුණු පණිවිඩ',
  'EXPENSE HISTORY': 'වියදම් ඉතිහාසය',
  'My submissions': 'මගේ ඉදිරිපත් කිරීම්',
  'Expense transactions': 'වියදම් ගනුදෙනු',
  'No expenses yet.': 'තවම වියදම් නැහැ.',
  'Please enter an expense name and valid amount.': 'වියදමේ නම සහ වලංගු මුදලක් ඇතුළත් කරන්න.',
  'Unable to create the expense.': 'වියදම සෑදීමට නොහැකි විය.',
  'Expense saved, but bill upload failed:': 'වියදම සුරැකි නමුත් බිල්පත upload කිරීම අසාර්ථක විය:',
  'Bill compressed from': 'බිල්පත සංකුචිත කරන ලදී:',
  'Reason:': 'හේතුව:',
  'User': 'පරිශීලක',
  'Automatic': 'ස්වයංක්‍රීය',
  'No finalized payslips yet.': 'තවම අවසන් කළ වැටුප් පත්‍ර නැහැ.',
  'Profile salary': 'පැතිකඩ වැටුප',
  'active': 'සක්‍රීය',
  'inactive': 'අක්‍රීය',
  'Not marked': 'සලකුණු කර නැත',
  'Working days': 'වැඩ කරන දින',
  'Present': 'පැමිණි',
  'Absent': 'නොපැමිණි',
  'Leave': 'නිවාඩු',
  'Loading your workspace…': 'ඔබගේ වැඩ අවකාශය පූරණය වෙමින්…',
  'Loading invoices…': 'ඉන්වොයිස් පූරණය වෙමින්…',
  'Loading…': 'පූරණය වෙමින්…',
  'Saving…': 'සුරකිමින්…',
  'Creating…': 'සාදමින්…',
  'Send Message': 'පණිවිඩය යවන්න',
  'Subject and message are required.': 'මාතෘකාව සහ පණිවිඩය අවශ්‍යයි.',
  'Attachment must be 10 MB or smaller.': 'ඇමුණුම 10 MB හෝ ඊට අඩු විය යුතුයි.',
  'Use a JPG, PNG, WebP, PDF or text attachment.': 'JPG, PNG, WebP, PDF හෝ text ඇමුණුමක් භාවිතා කරන්න.',
  'Unable to send message.': 'පණිවිඩය යැවීමට නොහැකි විය.',
  'Unable to load messages.': 'පණිවිඩ පූරණය කිරීමට නොහැකි විය.',
  'To:': 'ලබන්නන්:',
  'Resolved': 'විසඳා අවසන්',
  'Replied': 'පිළිතුරු දී ඇත',
  'Open': 'විවෘත',
  'Stock updated and the movement was recorded.': 'තොගය යාවත්කාලීන කර චලනය සටහන් කරන ලදී.',
  'Select a product and enter a non-zero adjustment.': 'නිෂ්පාදනයක් තෝරා ශූන්‍ය නොවන සංශෝධනයක් ඇතුළත් කරන්න.',
  'Enter the reason for this stock adjustment.': 'මෙම තොග සංශෝධනයේ හේතුව ඇතුළත් කරන්න.',
  'No stock movements yet.': 'තවම තොග චලනයන් නැහැ.',
  'No report data for this month.': 'මෙම මාසයට වාර්තා දත්ත නැහැ.',
  'Credit notes': 'ණය සටහන්',
  'Credit amount': 'ණය මුදල',
  'Refund method': 'මුදල් ආපසු ගෙවීමේ ක්‍රමය',
  'Refund reference': 'මුදල් ආපසු ගෙවීමේ යොමු අංකය',
  'No finalized sales this month.': 'මෙම මාසයේ අවසන් කළ විකුණුම් නැහැ.',
  'Select product': 'නිෂ්පාදනය තෝරන්න',
  'Select invoice': 'ඉන්වොයිසයක් තෝරන්න',
  'Available to refund': 'ආපසු ගෙවිය හැකි මුදල',
  'No refundable amount': 'ආපසු ගෙවිය හැකි මුදලක් නැහැ',
  'Delivery and return changes are recorded automatically. Use adjustments only for stock counts, damages or corrections.': 'බෙදාහැරීම් සහ ආපසු ලැබීම් ස්වයංක්‍රීයව සටහන් වේ. තොග ගණන්, හානි හෝ නිවැරදි කිරීම් සඳහා පමණක් සංශෝධන භාවිතා කරන්න.',
  'Sales and received payments use the selected month. Outstanding totals show the current open balance.': 'විකුණුම් සහ ලැබුණු ගෙවීම් තෝරාගත් මාසයට අදාළ වේ. ගෙවීමට ඉතිරි එකතුව වත්මන් විවෘත ශේෂය පෙන්වයි.',
  'A credit note reduces the invoice balance. Returned quantities restore only the selected stock.': 'ණය සටහන ඉන්වොයිස් ශේෂය අඩු කරයි. ආපසු ලැබුණු ප්‍රමාණයෙන් තෝරාගත් තොගය පමණක් නැවත එක් වේ.',
  'Create shop invoices, delivery notes, payment records and premium white-and-gold PDFs.': 'වෙළඳසැල් ඉන්වොයිස්, බෙදාහැරීම් පත්‍ර, ගෙවීම් වාර්තා සහ සුදු-රන් premium PDF සාදන්න.',
  'Deliveries & invoices': 'බෙදාහැරීම් සහ ඉන්වොයිස්',
  'New invoice': 'නව ඉන්වොයිසයක්',
  'Invoice history': 'ඉන්වොයිස් ඉතිහාසය',
  'All statuses': 'සියලු තත්ත්ව',
  'All deliveries': 'සියලු බෙදාහැරීම්',
  'Invoice / delivery notes': 'ඉන්වොයිස් / බෙදාහැරීම් පත්‍ර',
  'Select active shop': 'සක්‍රීය වෙළඳසැලක් තෝරන්න',
  'Shop': 'වෙළඳසැල',
  'Items': 'අයිතම',
  'Line total': 'පේළි එකතුව',
  'Taxable amount': 'බද්දට යටත් මුදල',
  'Invoice total': 'ඉන්වොයිස් මුළු මුදල',
  'Net total': 'ශුද්ධ එකතුව',
  'No payments recorded.': 'ගෙවීම් සටහන් කර නැහැ.',
  'No invoices match these filters.': 'මෙම පෙරහන්වලට ගැළපෙන ඉන්වොයිස් නැහැ.',
  'Optional notes for the shop or delivery team': 'වෙළඳසැලට හෝ බෙදාහැරීම් කණ්ඩායමට අවශ්‍ය නම් සටහන්',
  'Optional bank or receipt reference': 'අවශ්‍ය නම් බැංකු හෝ රිසිට්පත් යොමු අංකය',
  'Outstanding:': 'ගෙවීමට ඉතිරි:',
  'No active products use': 'සක්‍රීය නිෂ්පාදන නැහැ',
  'Current stock': 'වත්මන් තොගය',
  'Stock changes must be made in Inventory so every movement is recorded.': 'සෑම චලනයක්ම සටහන් වීමට තොග වෙනස්කම් තොග පාලනයෙන් කළ යුතුයි.',
  'Current stock cannot be edited here.': 'වත්මන් තොගය මෙහි සංස්කරණය කළ නොහැක.',
  'Cash profit / loss': 'මුදල් පදනම් ලාභය / අලාභය',
  'Confirmed payments converted to LKR': 'තහවුරු කළ ගෙවීම් LKR වෙත පරිවර්තනය කර ඇත',
  'Only approved expenses affect cash profit': 'අනුමත වියදම් පමණක් මුදල් පදනම් ලාභයට බලපායි',
  'pending': 'බලාපොරොත්තුවෙන්',
  'approved': 'අනුමතයි',
  'rejected': 'ප්‍රතික්ෂේපයි',
  'finalized': 'අවසන් කර ඇත',
  'paid': 'ගෙවා ඇත',
  'draft': 'කෙටුම්පත',
  'sent': 'යවා ඇත',
  'partially_paid': 'කොටසක් ගෙවා ඇත',
  'overdue': 'කල් ඉකුත්',
  'cancelled': 'අවලංගු කර ඇත',
  'delivered': 'භාරදී ඇත',
  'packed': 'ඇසුරුම් කර ඇත',
  'present': 'පැමිණි',
  'absent': 'නොපැමිණි',
  'half_day': 'අර්ධ දිනය',
  'leave': 'නිවාඩු',
  'open': 'විවෘත',
  'read': 'කියවා ඇත',
  'replied': 'පිළිතුරු දී ඇත',
  'resolved': 'විසඳා අවසන්',
  'archived': 'සංරක්ෂිත',
  'Packaging': 'ඇසුරුම්',
  'Ingredients': 'අමුද්‍රව්‍ය',
  'Labels & Printing': 'ලේබල් සහ මුද්‍රණ',
  'Transport': 'ප්‍රවාහන',
  'Import / Customs': 'ආනයන / රේගු',
  'Marketing': 'අලෙවිකරණ',
  'Equipment': 'උපකරණ',
  'Salary / Staff': 'වැටුප් / කාර්ය මණ්ඩලය',
  'Sales refund': 'විකුණුම් මුදල් ආපසු ගෙවීම',
  'Chilli Products': 'මිරිස් නිෂ්පාදන',
  'Curry Powders': 'කරි කුඩු',
  'Pepper Products': 'ගම්මිරිස් නිෂ්පාදන',
  'Spice Mixes': 'කුළුබඩු මිශ්‍රණ',
  'Whole Spices': 'සම්පූර්ණ කුළුබඩු',
  'No expenses are waiting for approval.': 'අනුමැතිය සඳහා බලාපොරොත්තුවෙන් වියදම් නැහැ.',
  'Pending expense approvals': 'බලාපොරොත්තුවෙන් ඇති වියදම් අනුමැති',
  'Expense deleted.': 'වියදම මකා දැමීය.',
  'Income deleted.': 'ආදායම මකා දැමීය.',
  'AUDIT TRAIL': 'විගණන ඉතිහාසය',
  'INVENTORY CONTROL': 'තොග පාලනය',
  'BUSINESS REPORTS': 'ව්‍යාපාර වාර්තා',
  'RETURNS & REFUNDS': 'ආපසු ලැබීම් සහ මුදල් ආපසු ගෙවීම්',
  'SALES CONTROL': 'විකුණුම් පාලනය',
  'SALES RECORDS': 'විකුණුම් වාර්තා',
  'RECORD PAYMENT': 'ගෙවීම සටහන් කරන්න',
  'INVOICE DETAILS': 'ඉන්වොයිස් විස්තර',
  'PRODUCT LINES': 'නිෂ්පාදන පේළි',
  'Attachment (optional)': 'ඇමුණුම (අවශ්‍ය නම්)',
  'Unable to send reply.': 'පිළිතුර යැවීමට නොහැකි විය.',
  'Invoices & deliveries': 'ඉන්වොයිස් සහ බෙදාහැරීම්',
  'Available in Sales': 'විකුණුම් අංශයෙන් ලබාගත හැක',
  'Tracked in Sales': 'විකුණුම් අංශයේ සටහන් වේ',
  'Create PDF': 'PDF එක සාදන්න',
  'Create receipt PDF': 'ගෙවීම් ලදුපත් PDF එක සාදන්න',
  'Payment receipt PDF created.': 'ගෙවීම් ලදුපත් PDF එක සාදන ලදී.',
  'Credit note PDF created.': 'ණය සටහන් PDF එක සාදන ලදී.',
  'Refresh PDF': 'PDF නැවත සාදන්න',
  'Payslip PDF refreshed with the current premium design and employee language.': 'වත්මන් premium නිර්මාණය සහ සේවක භාෂාව අනුව වැටුප් පත්‍ර PDF එක නැවත සාදන ලදී.',
  'BUSINESS MANAGEMENT': 'ව්‍යාපාර කළමනාකරණය',
  'Welcome back': 'නැවත පිළිගනිමු',
  'Secure access for Aroma Ceylon administrators and team members.': 'Aroma Ceylon පරිපාලකයින් සහ කණ්ඩායම් සාමාජිකයින් සඳහා ආරක්ෂිත ප්‍රවේශය.',
  'Password': 'මුරපදය',
  'Signing in…': 'පිවිසෙමින්…',
  'Sign in': 'පිවිසෙන්න',
  'EMPLOYEE INVITATION': 'සේවක ආරාධනය',
  'Create your password': 'ඔබගේ මුරපදය සාදන්න',
  'Set a secure password to finish activating your Aroma Ceylon account.': 'ඔබගේ Aroma Ceylon ගිණුම සක්‍රීය කිරීම අවසන් කිරීමට ආරක්ෂිත මුරපදයක් සකසන්න.',
  'New password': 'නව මුරපදය',
  'Confirm password': 'මුරපදය තහවුරු කරන්න',
  'Activate account': 'ගිණුම සක්‍රීය කරන්න',
}


const originalNodeText = new WeakMap<Node, string>()
const lastTranslatedNodeText = new WeakMap<Node, string>()

const reverseDictionary = Object.fromEntries(
  Object.entries(dictionary).map(([english, sinhala]) => [sinhala, english]),
) as Record<string, string>


export function t(text: string, language: AppLanguage) {
  return language === 'si' ? dictionary[text] || text : reverseDictionary[text] || text
}

function replacePhrases(value: string, language: AppLanguage) {
  const source = language === 'si' ? dictionary : reverseDictionary
  const trimmed = value.trim()
  if (!trimmed) return value

  const direct = source[trimmed]
  if (direct) return value.replace(trimmed, direct)

  // Translate only clearly structured UI labels. Avoid replacing arbitrary
  // words inside product names, shop names or user-entered messages.
  const countMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (countMatch && source[countMatch[2]]) {
    return value.replace(trimmed, `${countMatch[1]} ${source[countMatch[2]]}`)
  }
  const colonIndex = trimmed.indexOf(':')
  if (colonIndex > 0) {
    const label = trimmed.slice(0, colonIndex)
    if (source[label]) return value.replace(trimmed, `${source[label]}${trimmed.slice(colonIndex)}`)
  }
  return value
}

function shouldSkip(node: Node) {
  const parent = node.parentElement
  if (!parent) return true
  if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return true
  return Boolean(parent.closest('[data-no-translate="true"]'))
}

export function useAutoTranslate(language: AppLanguage) {
  useEffect(() => {
    document.documentElement.lang = language === 'si' ? 'si' : 'en'
    let applying = false

    const translateTextNode = (node: Node) => {
      if (node.nodeType !== Node.TEXT_NODE || shouldSkip(node)) return
      const raw = node.textContent || ''
      if (!raw.trim()) return

      const previousTranslated = lastTranslatedNodeText.get(node)
      let english = originalNodeText.get(node)
      // React may reuse a text node for new content. When that happens, refresh
      // the stored source instead of translating the old label again.
      if (!english || raw !== previousTranslated) {
        english = language === 'en'
          ? raw
          : (reverseDictionary[raw.trim()] ? raw.replace(raw.trim(), reverseDictionary[raw.trim()]) : raw)
        originalNodeText.set(node, english)
      }

      const next = language === 'si' ? replacePhrases(english, 'si') : english
      lastTranslatedNodeText.set(node, next)
      if (next !== raw) node.textContent = next
    }

    const translateElementAttributes = (root: ParentNode) => {
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[placeholder]').forEach((element) => {
        const english = element.dataset.englishPlaceholder || reverseDictionary[element.placeholder] || element.placeholder
        element.dataset.englishPlaceholder = english
        element.placeholder = language === 'si' ? dictionary[english] || english : english
      })
      root.querySelectorAll<HTMLElement>('[title]').forEach((element) => {
        const current = element.getAttribute('title') || ''
        const english = element.dataset.englishTitle || reverseDictionary[current] || current
        element.dataset.englishTitle = english
        element.setAttribute('title', language === 'si' ? dictionary[english] || english : english)
      })
    }

    const walk = (root: Node) => {
      if (root instanceof HTMLElement && root.closest('[data-no-translate="true"]')) return
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root)
        return
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let current: Node | null = walker.nextNode()
      while (current) {
        translateTextNode(current)
        current = walker.nextNode()
      }
      if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) translateElementAttributes(root)
    }

    applying = true
    walk(document.body)
    applying = false

    const observer = new MutationObserver((mutations) => {
      if (applying) return
      applying = true
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTextNode(mutation.target)
        mutation.addedNodes.forEach(walk)
      }
      applying = false
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [language])
}
