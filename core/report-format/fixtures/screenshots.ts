// Draws synthetic app interfaces with equivalent framing for local evidence previews.
export function settingsScreenshot(proposed: boolean): string {
  const menuY = proposed ? 285 : 445;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="680" viewBox="0 0 960 680">
<rect width="960" height="680" fill="#f3f5f8"/><rect width="190" height="680" fill="#192535"/>
<g font-family="Arial,sans-serif"><text x="26" y="48" fill="#fff" font-size="23" font-weight="700">Northstar</text><text x="26" y="100" fill="#aab9ca" font-size="13">ACME WORKSPACE</text>
<g fill="#bfccdc" font-size="16"><text x="26" y="150">Overview</text><text x="26" y="195">Projects</text><text x="26" y="240">Members</text></g><rect x="14" y="270" width="162" height="43" rx="7" fill="#34465c"/><text x="26" y="297" fill="#fff" font-size="16">Settings</text>
<text x="234" y="54" fill="#718096" font-size="13">Workspace / Settings</text><text x="234" y="106" fill="#213044" font-size="29" font-weight="700">Account settings</text><text x="234" y="138" fill="#6f7d8c" font-size="15">Manage your profile and workspace preferences.</text>
<rect x="234" y="174" width="678" height="408" rx="12" fill="#fff" stroke="#dfe5ed"/><text x="264" y="215" fill="#213044" font-size="19" font-weight="700">Your profile</text><text x="264" y="249" fill="#718096" font-size="14">This information is visible to your workspace.</text>
<text x="264" y="294" fill="#37465a" font-size="14">Full name</text><rect x="264" y="308" width="388" height="43" rx="6" fill="#fff" stroke="#cbd5e1"/><text x="278" y="335" fill="#384a60" font-size="16">Alex Morgan</text><text x="264" y="387" fill="#37465a" font-size="14">Email address</text><rect x="264" y="401" width="388" height="43" rx="6" fill="#fff" stroke="#cbd5e1"/><text x="278" y="428" fill="#384a60" font-size="16">alex@example.com</text>
<line x1="234" y1="480" x2="912" y2="480" stroke="#e5eaf0"/><rect x="722" y="510" width="160" height="42" rx="6" fill="#3c5ccf"/><text x="745" y="536" fill="#fff" font-size="15" font-weight="700">Save changes</text>
<rect x="264" y="512" width="175" height="40" rx="6" fill="#f5f7fa" stroke="#d6dee8"/><text x="281" y="537" fill="#37465a" font-size="15">Account menu ↑</text>
<rect x="${proposed ? 264 : 657}" y="${menuY}" width="236" height="${proposed ? 210 : 190}" rx="9" fill="#15253b" opacity=".12" transform="translate(0 5)"/>
<rect x="${proposed ? 264 : 657}" y="${menuY}" width="236" height="${proposed ? 210 : 190}" rx="9" fill="#fff" stroke="#bfcbdc"/>
<g fill="#33445a" font-size="15"><text x="${proposed ? 283 : 676}" y="${menuY + 36}">Manage account</text><text x="${proposed ? 283 : 676}" y="${menuY + 78}">Workspace preferences</text><text x="${proposed ? 283 : 676}" y="${menuY + 120}">Help and support</text><text x="${proposed ? 283 : 676}" y="${menuY + 163}">Sign out</text></g>
</g></svg>`;
}
