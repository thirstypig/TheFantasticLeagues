/**
 * The commissioner's original workbook for each archived season: the source of
 * truth the archive was read from, offered to members as an unedited download.
 *
 * One file per season: the workbook that holds that season's salaries, draft
 * and period sheets (a season's "End of Season" sheet sits in the NEXT year's
 * workbook). Where the Drive folder has several copies of a year, this is the
 * one with the most filled cells. 2003 has no workbook of its own: its final
 * rosters are in "Baseball Rosters 2004", so both seasons share that file.
 *
 * The bytes live in the private Supabase Storage bucket below, keyed by their
 * SHA-256, uploaded unchanged by scripts/archive/upload-source-workbooks.ts.
 * The download route re-checks the hash, so a served file is always the original.
 * fileName is Kent's own name for the file in Drive; nothing here names an owner.
 */
export const SOURCE_WORKBOOK_BUCKET = "archive-workbooks";

/**
 * The franchise these workbooks belong to (OGBA). The registry is keyed by year,
 * so every lookup must also match this franchise: another franchise's 2012 is
 * not OGBA's 2012.
 */
export const SOURCE_WORKBOOK_FRANCHISE_ID = 1;

export interface SourceWorkbook {
  year: number;
  /** The file's name in the commissioner's Drive folder. */
  fileName: string;
  bytes: number;
  sha256: string;
  /** Where it came from (the folder in workbook-manifest.json). */
  driveFileId: string;
}

export const SOURCE_WORKBOOKS: readonly SourceWorkbook[] = [
  { year: 2003, fileName: "Baseball Rosters 2004.xls", bytes: 40960, sha256: "9b147d99bbc8a77d9bb10b3dc40f6195565587c8824f360f998752f1dc2455d7", driveFileId: "1n9BulR0O-FyuuwoqDbmMiyEaE8PB9rF4" },
  { year: 2004, fileName: "Baseball Rosters 2004.xls", bytes: 40960, sha256: "9b147d99bbc8a77d9bb10b3dc40f6195565587c8824f360f998752f1dc2455d7", driveFileId: "1n9BulR0O-FyuuwoqDbmMiyEaE8PB9rF4" },
  { year: 2005, fileName: "FB.2005.xls", bytes: 61440, sha256: "c980dc406bf659277d1266453d0f297138c101aecfa29001a36315bb41c337a7", driveFileId: "1xSsyk9-Q_cRQtpYXddYSYSKY2MJt2Qiz" },
  { year: 2006, fileName: "Fantasy_Baseball_2006 copy.xls", bytes: 102912, sha256: "e00bc3b1402e93315f2fc20077890a6acb7bfa64481e23d647048f40d710d3df", driveFileId: "1aSikjRFZzu5X8Sw_QG-D2CD0ykhYk2JO" },
  { year: 2007, fileName: "Fantasy_Baseball_2007_Final.xls", bytes: 118272, sha256: "b507b81a47c1232d86b0c7c9f1290cbc9dcfdfbb504b4b6857af206487a753ff", driveFileId: "1wEb6hj-Sef2ALi04cg3Ssc8ds-MLoUuF" },
  { year: 2008, fileName: "Fantasy_Baseball_2008 copy.xls", bytes: 118272, sha256: "937957c9afbe4f730133cbf41b4e9d5526fd74f67f1ee6137b3641654b3c115b", driveFileId: "1WzWf943I8HHdHlAAOY3St8iCO2VOAAA2" },
  { year: 2009, fileName: "Fantasy_Baseball_2009 copy.xls", bytes: 120832, sha256: "99f5267b5c00da14a85b10cc8aef6c4616f5f3c617dd105cdf55c189c47325fc", driveFileId: "1LLsMbgwbpxaNNOGW37ZwHUZ2IW-NmKyQ" },
  { year: 2010, fileName: "Fantasy_Baseball_2010.xls", bytes: 129536, sha256: "f1a240917e44df110dee7b25d3483d76a03e53529f360dc5e342dc76aee77b45", driveFileId: "1zCTsAmiJCJH7U-xdh8oUQ-XQ-F0zZ7-g" },
  { year: 2011, fileName: "Fantasy_Baseball_2011.xls", bytes: 117760, sha256: "333c9612f8cb2d758c1d3ef305dff3bac7b46ad2695c76aba0ab377873972961", driveFileId: "1x5FlMXtk_BjnQ8Zi1QRBnuFd88-RWXDM" },
  { year: 2012, fileName: "Fantasy_Baseball_2012.xls", bytes: 118272, sha256: "fc46f12020325d0d506ae3d4e3bbde6c64341f8844b88fa6881559c35b850177", driveFileId: "13Uboy2lp4cFoZZalthBk9x9xBT2zXyjg" },
  { year: 2013, fileName: "Fantasy_Baseball_2013.xls", bytes: 124416, sha256: "4a6478aefdd1240077932680a4fd9aeef4151371f35dc11fa4913fee04cb3d2f", driveFileId: "1j6nf49yrsTBvxjq03WnW0MRMcatpR5sI" },
  { year: 2014, fileName: "Fantasy_Baseball_2014.xls", bytes: 148992, sha256: "974728df404f6716d251e660a16b8883bf484abc2983a387aa3f32fdf37a54d5", driveFileId: "1XUrDpYhCwLm6foXk06LYM8jFcfb_ty2X" },
  { year: 2015, fileName: "Fantasy_Baseball_2015.xls", bytes: 139776, sha256: "86917a15bdd8727ad9832875332d0e717e2db33326a0e4bd193b7bf61fa9945b", driveFileId: "1JhuIOd4qBv8bbOM6iV1Var85yJP5NF3q" },
  { year: 2016, fileName: "Fantasy_Baseball_2016 copy 2.xls", bytes: 114176, sha256: "946dd1d760d2de05d953105fde422711585b8f03cc94df5fcccb977bdcfc778f", driveFileId: "1LgOJOAUhlLFiw7MJvcqXXwyQ4faocn79" },
  { year: 2017, fileName: "Fantasy_Baseball_2017 copy.xls", bytes: 171520, sha256: "acfb157becef5e45cac957c4fc388220e0a271d2a4669fe0ee466221c57b15b0", driveFileId: "10CTz9QV3WahfrJ5YoszDAub6m4jUVVTH" },
  { year: 2018, fileName: "Fantasy_Baseball_2018 copy 2.xls", bytes: 144384, sha256: "ae96d3840a5d63f3ba9582f398f0f6b4087a0b0da8f6326df931b634a26086b7", driveFileId: "1R1jtdK5WpGJ3mu4rW1RJXWKjWy4UdVJg" },
  { year: 2019, fileName: "Fantasy_Baseball_2019.xls", bytes: 143872, sha256: "fe54779215e1e11b1dc95ef9a8714644781bdcffc57d00c6ae6dd2283926e982", driveFileId: "1W4YiZEoOTCBqbruIfX9mHY1e7ehGFJSf" },
  { year: 2020, fileName: "Fantasy_Baseball_2020 copy.xls", bytes: 122880, sha256: "c2afd9fa12526addbca6e9269e976221027bdf0d7af18a0ae4356ef59217cdc3", driveFileId: "1NkJZpJXjYpCGo4vgSU49S7ACxvnI3bEz" },
  { year: 2021, fileName: "Fantasy_Baseball_2021 copy.xls", bytes: 128512, sha256: "a5812649577d3e356fe774112f2d0402ca64e3d84b10ce9f1760cbe843524638", driveFileId: "1bN2YyT_vHIVRcC9YC6MBm8n4o8ARMizG" },
  { year: 2022, fileName: "Fantasy_Baseball_2022 copy.xls", bytes: 130560, sha256: "28d4d84b4bdff7717ccd8fed24f6998aa8c9793ae86321c405f892324f460e2d", driveFileId: "1ty1Feuua8V_iJRCwfGAGeXdAexRy2qOT" },
  { year: 2023, fileName: "Fantasy_Baseball_2023 copy.xls", bytes: 125952, sha256: "d54c8a61379a3fe067789cc4c4f6df93a15d82f8fc974056f30d8ca068ed6b8c", driveFileId: "17A33CfduyNblJGVJ_7b2wx0RS0Y_et_l" },
  { year: 2024, fileName: "Fantasy_Baseball_2024 copy 2.xls", bytes: 160768, sha256: "1923b2b616fcc5c68733e43c2456f754a9b8467bf18596c26fedcd19ebbe6a9b", driveFileId: "1VOmeMW0_ZR1fFAYyD9FaB375pQN1DyC-" },
  { year: 2025, fileName: "Fantasy_Baseball_2025 - FINAL.xls", bytes: 246272, sha256: "7a46ba2a8970e5c7abda7e7456abe10dc89f44df4839ecdd4e93a187c4198465", driveFileId: "1y1zGTRJVY7nqTFv13_XC13EompW63w2U" },
];

/** Storage object key: content-addressed, so a shared file (2003/2004) is stored once. */
export const workbookObjectKey = (w: SourceWorkbook) => `${w.sha256}.xls`;

/** The workbook for an archived season of `franchiseId`, if that's OGBA and the year has one. */
export const sourceWorkbookFor = (year: number, franchiseId: number | null | undefined): SourceWorkbook | undefined =>
  franchiseId === SOURCE_WORKBOOK_FRANCHISE_ID ? SOURCE_WORKBOOKS.find((w) => w.year === year) : undefined;
