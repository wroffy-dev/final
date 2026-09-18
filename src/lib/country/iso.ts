/**
 * ISO 3166-1 alpha-2, for the country picker.
 *
 * The 249 officially assigned codes. Names come from ICU's English region
 * display names rather than being typed by hand, and the currency is the one
 * ISO 4217 code in general use in that territory.
 *
 * The currency and symbol are **suggestions**. A reseller billing the Gulf in
 * dollars, or a territory that in practice trades in its neighbour's currency,
 * is a business decision — the admin can change both, and nothing here
 * overrides a saved value.
 */

export type IsoCountry = {
  /** Alpha-2, upper case. */
  code: string;
  name: string;
  /** ISO 4217, or empty where no currency is in general use (Antarctica). */
  currency: string;
  symbol: string;
};

export const ISO_COUNTRIES: readonly IsoCountry[] = [
  { code: 'AD', name: "Andorra", currency: 'EUR', symbol: "€" },
  { code: 'AE', name: "United Arab Emirates", currency: 'AED', symbol: "AED" },
  { code: 'AF', name: "Afghanistan", currency: 'AFN', symbol: "؋" },
  { code: 'AG', name: "Antigua & Barbuda", currency: 'XCD', symbol: "$" },
  { code: 'AI', name: "Anguilla", currency: 'XCD', symbol: "$" },
  { code: 'AL', name: "Albania", currency: 'ALL', symbol: "ALL" },
  { code: 'AM', name: "Armenia", currency: 'AMD', symbol: "֏" },
  { code: 'AO', name: "Angola", currency: 'AOA', symbol: "Kz" },
  { code: 'AQ', name: "Antarctica", currency: '', symbol: "" },
  { code: 'AR', name: "Argentina", currency: 'ARS', symbol: "$" },
  { code: 'AS', name: "American Samoa", currency: 'USD', symbol: "$" },
  { code: 'AT', name: "Austria", currency: 'EUR', symbol: "€" },
  { code: 'AU', name: "Australia", currency: 'AUD', symbol: "$" },
  { code: 'AW', name: "Aruba", currency: 'AWG', symbol: "AWG" },
  { code: 'AX', name: "Åland Islands", currency: 'EUR', symbol: "€" },
  { code: 'AZ', name: "Azerbaijan", currency: 'AZN', symbol: "₼" },
  { code: 'BA', name: "Bosnia & Herzegovina", currency: 'BAM', symbol: "KM" },
  { code: 'BB', name: "Barbados", currency: 'BBD', symbol: "$" },
  { code: 'BD', name: "Bangladesh", currency: 'BDT', symbol: "৳" },
  { code: 'BE', name: "Belgium", currency: 'EUR', symbol: "€" },
  { code: 'BF', name: "Burkina Faso", currency: 'XOF', symbol: "F CFA" },
  { code: 'BG', name: "Bulgaria", currency: 'BGN', symbol: "BGN" },
  { code: 'BH', name: "Bahrain", currency: 'BHD', symbol: "BHD" },
  { code: 'BI', name: "Burundi", currency: 'BIF', symbol: "BIF" },
  { code: 'BJ', name: "Benin", currency: 'XOF', symbol: "F CFA" },
  { code: 'BL', name: "St. Barthélemy", currency: 'EUR', symbol: "€" },
  { code: 'BM', name: "Bermuda", currency: 'BMD', symbol: "$" },
  { code: 'BN', name: "Brunei", currency: 'BND', symbol: "$" },
  { code: 'BO', name: "Bolivia", currency: 'BOB', symbol: "Bs" },
  { code: 'BQ', name: "Caribbean Netherlands", currency: 'USD', symbol: "$" },
  { code: 'BR', name: "Brazil", currency: 'BRL', symbol: "R$" },
  { code: 'BS', name: "Bahamas", currency: 'BSD', symbol: "$" },
  { code: 'BT', name: "Bhutan", currency: 'BTN', symbol: "BTN" },
  { code: 'BV', name: "Bouvet Island", currency: 'NOK', symbol: "kr" },
  { code: 'BW', name: "Botswana", currency: 'BWP', symbol: "P" },
  { code: 'BY', name: "Belarus", currency: 'BYN', symbol: "BYN" },
  { code: 'BZ', name: "Belize", currency: 'BZD', symbol: "$" },
  { code: 'CA', name: "Canada", currency: 'CAD', symbol: "$" },
  { code: 'CC', name: "Cocos (Keeling) Islands", currency: 'AUD', symbol: "$" },
  { code: 'CD', name: "Congo - Kinshasa", currency: 'CDF', symbol: "CDF" },
  { code: 'CF', name: "Central African Republic", currency: 'XAF', symbol: "FCFA" },
  { code: 'CG', name: "Congo - Brazzaville", currency: 'XAF', symbol: "FCFA" },
  { code: 'CH', name: "Switzerland", currency: 'CHF', symbol: "CHF" },
  { code: 'CI', name: "Côte d’Ivoire", currency: 'XOF', symbol: "F CFA" },
  { code: 'CK', name: "Cook Islands", currency: 'NZD', symbol: "$" },
  { code: 'CL', name: "Chile", currency: 'CLP', symbol: "$" },
  { code: 'CM', name: "Cameroon", currency: 'XAF', symbol: "FCFA" },
  { code: 'CN', name: "China", currency: 'CNY', symbol: "¥" },
  { code: 'CO', name: "Colombia", currency: 'COP', symbol: "$" },
  { code: 'CR', name: "Costa Rica", currency: 'CRC', symbol: "₡" },
  { code: 'CU', name: "Cuba", currency: 'CUP', symbol: "$" },
  { code: 'CV', name: "Cape Verde", currency: 'CVE', symbol: "CVE" },
  { code: 'CW', name: "Curaçao", currency: 'ANG', symbol: "ANG" },
  { code: 'CX', name: "Christmas Island", currency: 'AUD', symbol: "$" },
  { code: 'CY', name: "Cyprus", currency: 'EUR', symbol: "€" },
  { code: 'CZ', name: "Czechia", currency: 'CZK', symbol: "Kč" },
  { code: 'DE', name: "Germany", currency: 'EUR', symbol: "€" },
  { code: 'DJ', name: "Djibouti", currency: 'DJF', symbol: "DJF" },
  { code: 'DK', name: "Denmark", currency: 'DKK', symbol: "kr" },
  { code: 'DM', name: "Dominica", currency: 'XCD', symbol: "$" },
  { code: 'DO', name: "Dominican Republic", currency: 'DOP', symbol: "$" },
  { code: 'DZ', name: "Algeria", currency: 'DZD', symbol: "DZD" },
  { code: 'EC', name: "Ecuador", currency: 'USD', symbol: "$" },
  { code: 'EE', name: "Estonia", currency: 'EUR', symbol: "€" },
  { code: 'EG', name: "Egypt", currency: 'EGP', symbol: "E£" },
  { code: 'EH', name: "Western Sahara", currency: 'MAD', symbol: "MAD" },
  { code: 'ER', name: "Eritrea", currency: 'ERN', symbol: "ERN" },
  { code: 'ES', name: "Spain", currency: 'EUR', symbol: "€" },
  { code: 'ET', name: "Ethiopia", currency: 'ETB', symbol: "ETB" },
  { code: 'FI', name: "Finland", currency: 'EUR', symbol: "€" },
  { code: 'FJ', name: "Fiji", currency: 'FJD', symbol: "$" },
  { code: 'FK', name: "Falkland Islands", currency: 'FKP', symbol: "£" },
  { code: 'FM', name: "Micronesia", currency: 'USD', symbol: "$" },
  { code: 'FO', name: "Faroe Islands", currency: 'DKK', symbol: "kr" },
  { code: 'FR', name: "France", currency: 'EUR', symbol: "€" },
  { code: 'GA', name: "Gabon", currency: 'XAF', symbol: "FCFA" },
  { code: 'GB', name: "United Kingdom", currency: 'GBP', symbol: "£" },
  { code: 'GD', name: "Grenada", currency: 'XCD', symbol: "$" },
  { code: 'GE', name: "Georgia", currency: 'GEL', symbol: "₾" },
  { code: 'GF', name: "French Guiana", currency: 'EUR', symbol: "€" },
  { code: 'GG', name: "Guernsey", currency: 'GBP', symbol: "£" },
  { code: 'GH', name: "Ghana", currency: 'GHS', symbol: "GH₵" },
  { code: 'GI', name: "Gibraltar", currency: 'GIP', symbol: "£" },
  { code: 'GL', name: "Greenland", currency: 'DKK', symbol: "kr" },
  { code: 'GM', name: "Gambia", currency: 'GMD', symbol: "GMD" },
  { code: 'GN', name: "Guinea", currency: 'GNF', symbol: "FG" },
  { code: 'GP', name: "Guadeloupe", currency: 'EUR', symbol: "€" },
  { code: 'GQ', name: "Equatorial Guinea", currency: 'XAF', symbol: "FCFA" },
  { code: 'GR', name: "Greece", currency: 'EUR', symbol: "€" },
  { code: 'GS', name: "South Georgia & South Sandwich Islands", currency: 'GBP', symbol: "£" },
  { code: 'GT', name: "Guatemala", currency: 'GTQ', symbol: "Q" },
  { code: 'GU', name: "Guam", currency: 'USD', symbol: "$" },
  { code: 'GW', name: "Guinea-Bissau", currency: 'XOF', symbol: "F CFA" },
  { code: 'GY', name: "Guyana", currency: 'GYD', symbol: "$" },
  { code: 'HK', name: "Hong Kong SAR China", currency: 'HKD', symbol: "$" },
  { code: 'HM', name: "Heard & McDonald Islands", currency: 'AUD', symbol: "$" },
  { code: 'HN', name: "Honduras", currency: 'HNL', symbol: "L" },
  { code: 'HR', name: "Croatia", currency: 'EUR', symbol: "€" },
  { code: 'HT', name: "Haiti", currency: 'HTG', symbol: "HTG" },
  { code: 'HU', name: "Hungary", currency: 'HUF', symbol: "Ft" },
  { code: 'ID', name: "Indonesia", currency: 'IDR', symbol: "Rp" },
  { code: 'IE', name: "Ireland", currency: 'EUR', symbol: "€" },
  { code: 'IL', name: "Israel", currency: 'ILS', symbol: "₪" },
  { code: 'IM', name: "Isle of Man", currency: 'GBP', symbol: "£" },
  { code: 'IN', name: "India", currency: 'INR', symbol: "₹" },
  { code: 'IO', name: "British Indian Ocean Territory", currency: 'USD', symbol: "$" },
  { code: 'IQ', name: "Iraq", currency: 'IQD', symbol: "IQD" },
  { code: 'IR', name: "Iran", currency: 'IRR', symbol: "IRR" },
  { code: 'IS', name: "Iceland", currency: 'ISK', symbol: "kr" },
  { code: 'IT', name: "Italy", currency: 'EUR', symbol: "€" },
  { code: 'JE', name: "Jersey", currency: 'GBP', symbol: "£" },
  { code: 'JM', name: "Jamaica", currency: 'JMD', symbol: "$" },
  { code: 'JO', name: "Jordan", currency: 'JOD', symbol: "JOD" },
  { code: 'JP', name: "Japan", currency: 'JPY', symbol: "¥" },
  { code: 'KE', name: "Kenya", currency: 'KES', symbol: "KES" },
  { code: 'KG', name: "Kyrgyzstan", currency: 'KGS', symbol: "⃀" },
  { code: 'KH', name: "Cambodia", currency: 'KHR', symbol: "៛" },
  { code: 'KI', name: "Kiribati", currency: 'AUD', symbol: "$" },
  { code: 'KM', name: "Comoros", currency: 'KMF', symbol: "CF" },
  { code: 'KN', name: "St. Kitts & Nevis", currency: 'XCD', symbol: "$" },
  { code: 'KP', name: "North Korea", currency: 'KPW', symbol: "₩" },
  { code: 'KR', name: "South Korea", currency: 'KRW', symbol: "₩" },
  { code: 'KW', name: "Kuwait", currency: 'KWD', symbol: "KWD" },
  { code: 'KY', name: "Cayman Islands", currency: 'KYD', symbol: "$" },
  { code: 'KZ', name: "Kazakhstan", currency: 'KZT', symbol: "₸" },
  { code: 'LA', name: "Laos", currency: 'LAK', symbol: "₭" },
  { code: 'LB', name: "Lebanon", currency: 'LBP', symbol: "L£" },
  { code: 'LC', name: "St. Lucia", currency: 'XCD', symbol: "$" },
  { code: 'LI', name: "Liechtenstein", currency: 'CHF', symbol: "CHF" },
  { code: 'LK', name: "Sri Lanka", currency: 'LKR', symbol: "Rs" },
  { code: 'LR', name: "Liberia", currency: 'LRD', symbol: "$" },
  { code: 'LS', name: "Lesotho", currency: 'LSL', symbol: "LSL" },
  { code: 'LT', name: "Lithuania", currency: 'EUR', symbol: "€" },
  { code: 'LU', name: "Luxembourg", currency: 'EUR', symbol: "€" },
  { code: 'LV', name: "Latvia", currency: 'EUR', symbol: "€" },
  { code: 'LY', name: "Libya", currency: 'LYD', symbol: "LYD" },
  { code: 'MA', name: "Morocco", currency: 'MAD', symbol: "MAD" },
  { code: 'MC', name: "Monaco", currency: 'EUR', symbol: "€" },
  { code: 'MD', name: "Moldova", currency: 'MDL', symbol: "MDL" },
  { code: 'ME', name: "Montenegro", currency: 'EUR', symbol: "€" },
  { code: 'MF', name: "St. Martin", currency: 'EUR', symbol: "€" },
  { code: 'MG', name: "Madagascar", currency: 'MGA', symbol: "Ar" },
  { code: 'MH', name: "Marshall Islands", currency: 'USD', symbol: "$" },
  { code: 'MK', name: "North Macedonia", currency: 'MKD', symbol: "MKD" },
  { code: 'ML', name: "Mali", currency: 'XOF', symbol: "F CFA" },
  { code: 'MM', name: "Myanmar (Burma)", currency: 'MMK', symbol: "K" },
  { code: 'MN', name: "Mongolia", currency: 'MNT', symbol: "₮" },
  { code: 'MO', name: "Macao SAR China", currency: 'MOP', symbol: "MOP" },
  { code: 'MP', name: "Northern Mariana Islands", currency: 'USD', symbol: "$" },
  { code: 'MQ', name: "Martinique", currency: 'EUR', symbol: "€" },
  { code: 'MR', name: "Mauritania", currency: 'MRU', symbol: "MRU" },
  { code: 'MS', name: "Montserrat", currency: 'XCD', symbol: "$" },
  { code: 'MT', name: "Malta", currency: 'EUR', symbol: "€" },
  { code: 'MU', name: "Mauritius", currency: 'MUR', symbol: "Rs" },
  { code: 'MV', name: "Maldives", currency: 'MVR', symbol: "MVR" },
  { code: 'MW', name: "Malawi", currency: 'MWK', symbol: "MWK" },
  { code: 'MX', name: "Mexico", currency: 'MXN', symbol: "$" },
  { code: 'MY', name: "Malaysia", currency: 'MYR', symbol: "RM" },
  { code: 'MZ', name: "Mozambique", currency: 'MZN', symbol: "MZN" },
  { code: 'NA', name: "Namibia", currency: 'NAD', symbol: "$" },
  { code: 'NC', name: "New Caledonia", currency: 'XPF', symbol: "CFPF" },
  { code: 'NE', name: "Niger", currency: 'XOF', symbol: "F CFA" },
  { code: 'NF', name: "Norfolk Island", currency: 'AUD', symbol: "$" },
  { code: 'NG', name: "Nigeria", currency: 'NGN', symbol: "₦" },
  { code: 'NI', name: "Nicaragua", currency: 'NIO', symbol: "C$" },
  { code: 'NL', name: "Netherlands", currency: 'EUR', symbol: "€" },
  { code: 'NO', name: "Norway", currency: 'NOK', symbol: "kr" },
  { code: 'NP', name: "Nepal", currency: 'NPR', symbol: "Rs" },
  { code: 'NR', name: "Nauru", currency: 'AUD', symbol: "$" },
  { code: 'NU', name: "Niue", currency: 'NZD', symbol: "$" },
  { code: 'NZ', name: "New Zealand", currency: 'NZD', symbol: "$" },
  { code: 'OM', name: "Oman", currency: 'OMR', symbol: "OMR" },
  { code: 'PA', name: "Panama", currency: 'PAB', symbol: "PAB" },
  { code: 'PE', name: "Peru", currency: 'PEN', symbol: "PEN" },
  { code: 'PF', name: "French Polynesia", currency: 'XPF', symbol: "CFPF" },
  { code: 'PG', name: "Papua New Guinea", currency: 'PGK', symbol: "PGK" },
  { code: 'PH', name: "Philippines", currency: 'PHP', symbol: "₱" },
  { code: 'PK', name: "Pakistan", currency: 'PKR', symbol: "Rs" },
  { code: 'PL', name: "Poland", currency: 'PLN', symbol: "zł" },
  { code: 'PM', name: "St. Pierre & Miquelon", currency: 'EUR', symbol: "€" },
  { code: 'PN', name: "Pitcairn Islands", currency: 'NZD', symbol: "$" },
  { code: 'PR', name: "Puerto Rico", currency: 'USD', symbol: "$" },
  { code: 'PS', name: "Palestinian Territories", currency: 'ILS', symbol: "₪" },
  { code: 'PT', name: "Portugal", currency: 'EUR', symbol: "€" },
  { code: 'PW', name: "Palau", currency: 'USD', symbol: "$" },
  { code: 'PY', name: "Paraguay", currency: 'PYG', symbol: "₲" },
  { code: 'QA', name: "Qatar", currency: 'QAR', symbol: "QAR" },
  { code: 'RE', name: "Réunion", currency: 'EUR', symbol: "€" },
  { code: 'RO', name: "Romania", currency: 'RON', symbol: "lei" },
  { code: 'RS', name: "Serbia", currency: 'RSD', symbol: "RSD" },
  { code: 'RU', name: "Russia", currency: 'RUB', symbol: "₽" },
  { code: 'RW', name: "Rwanda", currency: 'RWF', symbol: "RF" },
  { code: 'SA', name: "Saudi Arabia", currency: 'SAR', symbol: "SAR" },
  { code: 'SB', name: "Solomon Islands", currency: 'SBD', symbol: "$" },
  { code: 'SC', name: "Seychelles", currency: 'SCR', symbol: "SCR" },
  { code: 'SD', name: "Sudan", currency: 'SDG', symbol: "SDG" },
  { code: 'SE', name: "Sweden", currency: 'SEK', symbol: "kr" },
  { code: 'SG', name: "Singapore", currency: 'SGD', symbol: "$" },
  { code: 'SH', name: "St. Helena", currency: 'SHP', symbol: "£" },
  { code: 'SI', name: "Slovenia", currency: 'EUR', symbol: "€" },
  { code: 'SJ', name: "Svalbard & Jan Mayen", currency: 'NOK', symbol: "kr" },
  { code: 'SK', name: "Slovakia", currency: 'EUR', symbol: "€" },
  { code: 'SL', name: "Sierra Leone", currency: 'SLE', symbol: "SLE" },
  { code: 'SM', name: "San Marino", currency: 'EUR', symbol: "€" },
  { code: 'SN', name: "Senegal", currency: 'XOF', symbol: "F CFA" },
  { code: 'SO', name: "Somalia", currency: 'SOS', symbol: "SOS" },
  { code: 'SR', name: "Suriname", currency: 'SRD', symbol: "$" },
  { code: 'SS', name: "South Sudan", currency: 'SSP', symbol: "£" },
  { code: 'ST', name: "São Tomé & Príncipe", currency: 'STN', symbol: "Db" },
  { code: 'SV', name: "El Salvador", currency: 'USD', symbol: "$" },
  { code: 'SX', name: "Sint Maarten", currency: 'ANG', symbol: "ANG" },
  { code: 'SY', name: "Syria", currency: 'SYP', symbol: "£" },
  { code: 'SZ', name: "Eswatini", currency: 'SZL', symbol: "SZL" },
  { code: 'TC', name: "Turks & Caicos Islands", currency: 'USD', symbol: "$" },
  { code: 'TD', name: "Chad", currency: 'XAF', symbol: "FCFA" },
  { code: 'TF', name: "French Southern Territories", currency: 'EUR', symbol: "€" },
  { code: 'TG', name: "Togo", currency: 'XOF', symbol: "F CFA" },
  { code: 'TH', name: "Thailand", currency: 'THB', symbol: "฿" },
  { code: 'TJ', name: "Tajikistan", currency: 'TJS', symbol: "TJS" },
  { code: 'TK', name: "Tokelau", currency: 'NZD', symbol: "$" },
  { code: 'TL', name: "Timor-Leste", currency: 'USD', symbol: "$" },
  { code: 'TM', name: "Turkmenistan", currency: 'TMT', symbol: "TMT" },
  { code: 'TN', name: "Tunisia", currency: 'TND', symbol: "TND" },
  { code: 'TO', name: "Tonga", currency: 'TOP', symbol: "T$" },
  { code: 'TR', name: "Türkiye", currency: 'TRY', symbol: "₺" },
  { code: 'TT', name: "Trinidad & Tobago", currency: 'TTD', symbol: "$" },
  { code: 'TV', name: "Tuvalu", currency: 'AUD', symbol: "$" },
  { code: 'TW', name: "Taiwan", currency: 'TWD', symbol: "$" },
  { code: 'TZ', name: "Tanzania", currency: 'TZS', symbol: "TZS" },
  { code: 'UA', name: "Ukraine", currency: 'UAH', symbol: "₴" },
  { code: 'UG', name: "Uganda", currency: 'UGX', symbol: "UGX" },
  { code: 'UM', name: "U.S. Outlying Islands", currency: 'USD', symbol: "$" },
  { code: 'US', name: "United States", currency: 'USD', symbol: "$" },
  { code: 'UY', name: "Uruguay", currency: 'UYU', symbol: "$" },
  { code: 'UZ', name: "Uzbekistan", currency: 'UZS', symbol: "UZS" },
  { code: 'VA', name: "Vatican City", currency: 'EUR', symbol: "€" },
  { code: 'VC', name: "St. Vincent & Grenadines", currency: 'XCD', symbol: "$" },
  { code: 'VE', name: "Venezuela", currency: 'VES', symbol: "VES" },
  { code: 'VG', name: "British Virgin Islands", currency: 'USD', symbol: "$" },
  { code: 'VI', name: "U.S. Virgin Islands", currency: 'USD', symbol: "$" },
  { code: 'VN', name: "Vietnam", currency: 'VND', symbol: "₫" },
  { code: 'VU', name: "Vanuatu", currency: 'VUV', symbol: "VUV" },
  { code: 'WF', name: "Wallis & Futuna", currency: 'XPF', symbol: "CFPF" },
  { code: 'WS', name: "Samoa", currency: 'WST', symbol: "WST" },
  { code: 'YE', name: "Yemen", currency: 'YER', symbol: "YER" },
  { code: 'YT', name: "Mayotte", currency: 'EUR', symbol: "€" },
  { code: 'ZA', name: "South Africa", currency: 'ZAR', symbol: "R" },
  { code: 'ZM', name: "Zambia", currency: 'ZMW', symbol: "ZK" },
  { code: 'ZW', name: "Zimbabwe", currency: 'ZWG', symbol: "ZWG" },];

const BY_CODE = new Map(ISO_COUNTRIES.map((country) => [country.code, country]));

export function isoCountry(code: string): IsoCountry | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/**
 * A URL prefix to start from, derived from the code.
 *
 * Lower-cased alpha-2 is short, stable and already what the UAE market uses.
 * It is only a suggestion: the field stays editable, because "uk" reads better
 * than "gb" to most people and that is the business's call, not ISO's.
 */
export function suggestedSlug(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * A BCP-47 tag to start from.
 *
 * English, because that is the language this site's content is written in.
 * ICU would infer the territory's majority language — `hi-IN` for India — but
 * suggesting that for an English site would be a worse starting point than the
 * `en-IN` the existing India record already uses.
 */
export function suggestedLocale(code: string): string {
  return `en-${code.trim().toUpperCase()}`;
}

/** Matches on name or code, for the picker's search box. */
export function searchCountries(query: string, limit = 60): IsoCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ISO_COUNTRIES.slice(0, limit);

  const starts: IsoCountry[] = [];
  const contains: IsoCountry[] = [];
  for (const country of ISO_COUNTRIES) {
    const name = country.name.toLowerCase();
    if (country.code.toLowerCase() === q || name.startsWith(q)) starts.push(country);
    else if (name.includes(q) || country.code.toLowerCase().startsWith(q)) contains.push(country);
  }
  return [...starts, ...contains].slice(0, limit);
}
