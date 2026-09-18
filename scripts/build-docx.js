const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require('docx');

const OUT_DIR = path.resolve(__dirname, '..');
const OUT_FILE = path.join(OUT_DIR, 'Rhythm_in_Motion_正式計畫書.docx');

const C = {
  ink: '292824',
  muted: '666159',
  terracotta: 'B95735',
  terracottaLight: 'F3DED4',
  parchment: 'F6F2E9',
  ivory: 'FCFAF5',
  sand: 'E8E0D3',
  line: 'D5CCBE',
  sage: '667260',
  sageLight: 'E2E8DE',
  white: 'FFFFFF',
  warning: '8A5A19',
  warningLight: 'F5E9CF',
};

const FONT = 'Microsoft JhengHei';
const BODY_SIZE = 21; // 10.5 pt
const CONTENT_WIDTH = 9000;

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: C.white },
  bottom: { style: BorderStyle.NONE, size: 0, color: C.white },
  left: { style: BorderStyle.NONE, size: 0, color: C.white },
  right: { style: BorderStyle.NONE, size: 0, color: C.white },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: C.white },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: C.white },
};

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 6, color: C.line },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line },
  left: { style: BorderStyle.SINGLE, size: 6, color: C.line },
  right: { style: BorderStyle.SINGLE, size: 6, color: C.line },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: C.line },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: C.line },
};

function textRun(text, options = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: BODY_SIZE,
    color: C.ink,
    ...options,
  });
}

function p(text = '', options = {}) {
  const {
    bold = false,
    color = C.ink,
    size = BODY_SIZE,
    before = 0,
    after = 140,
    alignment = AlignmentType.JUSTIFIED,
    keepNext = false,
    keepLines = false,
    indent,
    children,
    spacingLine = 340,
    style,
    border,
  } = options;
  return new Paragraph({
    style,
    alignment,
    keepNext,
    keepLines,
    indent,
    border,
    spacing: { before, after, line: spacingLine },
    children: children || [textRun(text, { bold, color, size })],
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    keepNext: true,
    keepLines: true,
    spacing: {
      before: level === HeadingLevel.HEADING_1 ? 340 : 220,
      after: level === HeadingLevel.HEADING_1 ? 180 : 120,
    },
    children: [new TextRun({ text, font: FONT })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'rim-bullets', level },
    indent: { left: 360 + level * 360, hanging: 220 },
    spacing: { after: 90, line: 320 },
    children: [textRun(text)],
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'rim-decimal', level },
    indent: { left: 420 + level * 360, hanging: 260 },
    spacing: { after: 100, line: 320 },
    children: [textRun(text)],
  });
}

function compactNumbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'rim-decimal', level },
    indent: { left: 420 + level * 360, hanging: 260 },
    spacing: { after: 45, line: 270 },
    children: [textRun(text, { size: 18 })],
  });
}

function labelValue(label, value) {
  return p('', {
    after: 80,
    alignment: AlignmentType.LEFT,
    children: [
      textRun(`${label}：`, { bold: true, color: C.terracotta }),
      textRun(value),
    ],
  });
}

function cell(text, width, options = {}) {
  const {
    fill = C.ivory,
    bold = false,
    color = C.ink,
    align = AlignmentType.LEFT,
    fontSize = 19,
    children,
    verticalAlign = VerticalAlign.CENTER,
    columnSpan,
  } = options;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign,
    columnSpan,
    shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
    margins: { top: 110, bottom: 110, left: 130, right: 130 },
    children:
      children ||
      [
        new Paragraph({
          alignment: align,
          spacing: { after: 0, line: 290 },
          children: [textRun(text, { bold, color, size: fontSize })],
        }),
      ],
  });
}

function makeTable(rows, widths, options = {}) {
  const { header = true, borders = tableBorders } = options;
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders,
    rows: rows.map((row, rowIndex) =>
      new TableRow({
        cantSplit: true,
        tableHeader: header && rowIndex === 0,
        children: row.map((item, colIndex) => {
          if (item instanceof TableCell) return item;
          const isHeader = header && rowIndex === 0;
          return cell(String(item), widths[colIndex], {
            fill: isHeader ? C.ink : rowIndex % 2 === 0 ? C.parchment : C.ivory,
            bold: isHeader,
            color: isHeader ? C.white : C.ink,
            align: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
          });
        }),
      })
    ),
  });
}

function callout(title, paragraphs, tone = 'sage') {
  const fill = tone === 'warning' ? C.warningLight : tone === 'brand' ? C.terracottaLight : C.sageLight;
  const accent = tone === 'warning' ? C.warning : tone === 'brand' ? C.terracotta : C.sage;
  const inner = [
    new Paragraph({
      keepNext: true,
      spacing: { after: 80 },
      children: [textRun(title, { bold: true, color: accent, size: 22 })],
    }),
    ...paragraphs.map((t) =>
      new Paragraph({
        spacing: { after: 70, line: 310 },
        children: [textRun(t, { color: C.ink, size: 19 })],
      })
    ),
  ];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: accent },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: accent },
      left: { style: BorderStyle.SINGLE, size: 18, color: accent },
      right: { style: BorderStyle.SINGLE, size: 8, color: accent },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: accent },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: accent },
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell('', CONTENT_WIDTH, {
            fill,
            children: inner,
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
    ],
  });
}

function spacer(size = 120) {
  return new Paragraph({ spacing: { before: 0, after: size }, children: [] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

const infoRows = [
  ['項目', '內容'],
  ['活動名稱', '《Rhythm in Motion｜把節奏裝進身體》爵士鼓律動與肢體表達經驗分享會'],
  ['活動性質', '公開藝術交流、感官體驗與經驗分享活動；不收費、不直播，正式流程不攝錄影'],
  ['主辦／分享人', '王苡丞'],
  ['主辦聯絡', 'cn922082000@gmail.com'],
  ['日期', '2026 年 11 月 28 日（星期六）'],
  ['時間', '14:00–15:00；13:30 開放簽到與候補；15:00–15:30 撤場'],
  ['地點', '臺灣當代文化實驗場（C-LAB）多功能廳，臺北市大安區建國南路一段 177 號（以館方核准與公告為準）'],
  ['人數', '上限 50 人（線上預約＋現場候補；以實際入場人數控管）'],
  ['建議對象', '12 歲以上一般大眾、音樂與表演藝術愛好者；未滿 12 歲需由成年家長全程陪同'],
];

const scheduleRows = [
  ['時間', '環節', '內容與公開互動設計', '形式'],
  ['13:30–14:00', '簽到與候補', '實名報到、核對名單並發放雙色感官卡及沙蛋。13:50 起依空缺席次釋出候補名額。', '實名列席'],
  ['14:00–14:10', '開場與經驗分享', '由打擊樂創作經驗切入，說明安全與參與原則；不使用樂器進行 4/4 拍 Call & Response。', '肢體互動'],
  ['14:10–14:25', '聲音微動態賞析', '比較「電腦精準拍」與「Pocket 微動態」，參與者以雙色卡選擇感受並交換觀察。', '感官選擇'],
  ['14:25–14:45', '集體感官共鳴', '分為低頻踏步／拍腿、中頻拍掌／輕拍胸前替代動作、高頻沙蛋三組，進行音量與密度堆疊。', '分組共創'],
  ['14:45–14:55', '現場對談交流', '邀請 2 位自願參與者示範，針對放鬆、肌肉回彈與聲音表現給予交流建議；可隨時退出。', '雙向對談'],
  ['14:55–15:00', '總結與 Q&A', '回應事前提問 1 題及現場提問 1 題，以一輪集體節奏收束；不安排合照或其他攝錄。', '公開問答'],
];

const riskRows = [
  ['風險項目', '預防措施', '現場應變與責任原則'],
  ['候補人潮與通道阻塞', '入口設單向排隊線、額滿告示與工作人員引導；13:50 統一釋出空位。', '額滿後停止發號並疏導至戶外公共區域；消防通道全程淨空。'],
  ['群體律動音量過高', '僅使用肢體輕拍與小型沙蛋；彩排確認音量，依館方分貝規範執行。', '分享人以手勢即時降階或停止；必要時改為無聲動作與雙色卡互動。'],
  ['肢體不適、跌倒或碰撞', '保留個人活動間距；禁止跳躍與奔跑；提供坐姿、拍腿與拍掌替代方案。', '立即停止鄰近活動、協助就座並通知場館人員；依館方急救與通報流程辦理。'],
  ['地震、火警或停電', '開場前確認出口、集合點與緊急照明；工作人員熟悉場館指引。', '停止活動、關閉擴音並依館方廣播與疏散指示引導；不自行返回取物。'],
  ['器材損壞或遺失', '沙蛋編號、進出點交；地面器材集中放置，線材加護線槽。', '隔離損壞器材並記錄；活動後依清冊盤點，若有館舍損害立即通報。'],
  ['個資誤用或外洩', '最小化蒐集、限制表單與名單權限，不公開參與者資訊。', '停止存取、保存事件紀錄並通知主辦人；依適用法規及館方程序評估通知與補救。'],
];

const equipmentRows = [
  ['項目', '數量', '用途／規格', '來源與確認點'],
  ['基礎擴音設備', '1 式', '播放示範音檔及語音擴音；音量須符合場館規範。', '與館方場勘確認'],
  ['無線麥克風', '2 支', '低延遲、電池充足；1 支主用、1 支備援或對談使用。', '館方提供或主辦自備'],
  ['雙色感官辨識卡', '50 份＋備品', '雙面高對比顏色，圓角、可擦拭。', '主辦製作'],
  ['手持打擊沙蛋', '50 顆＋備品', '無尖角、外殼完整、音量溫和；活動前後清潔。', '主辦自備'],
  ['計時器／流程提示卡', '1 組', '主持節奏與時間控管。', '主辦自備'],
  ['額滿告示與候補號碼牌', '1 組', '清楚標示報到截止、候補規則與停止入場時間。', '主辦製作'],
  ['急救與安全資源', '依館方配置', '確認 AED、急救箱、緊急出口與聯絡窗口位置。', '場勘確認'],
];

const children = [];

// Cover
children.push(
  spacer(340),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      textRun('●  ○  ●  ●  ○  ●  ○  ●', {
        bold: true,
        size: 30,
        color: C.terracotta,
        characterSpacing: 120,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [textRun('RHYTHM IN MOTION', { bold: true, size: 24, color: C.sage, characterSpacing: 180 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 110 },
    children: [textRun('把節奏裝進身體', { bold: true, size: 58, color: C.ink })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 220 },
    children: [textRun('跨界音樂與肢體藝術分享會｜正式計畫書', { size: 30, color: C.terracotta })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 460 },
    children: [textRun('身體打擊 × 聽覺微動態 × 社群集體創作', { size: 22, color: C.muted })],
  }),
  new Table({
    width: { size: 6600, type: WidthType.DXA },
    columnWidths: [1800, 4800],
    alignment: AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    rows: [
      new TableRow({ children: [cell('主辦／分享人', 1800, { fill: C.terracotta, color: C.white, bold: true }), cell('王苡丞', 4800, { fill: C.ivory })] }),
      new TableRow({ children: [cell('活動日期', 1800, { fill: C.sage, color: C.white, bold: true }), cell('2026 年 11 月 28 日（星期六）', 4800, { fill: C.parchment })] }),
      new TableRow({ children: [cell('預定場地', 1800, { fill: C.ink, color: C.white, bold: true }), cell('臺灣當代文化實驗場（C-LAB）多功能廳', 4800, { fill: C.ivory })] }),
      new TableRow({ children: [cell('文件版本', 1800, { fill: C.sand, color: C.ink, bold: true }), cell('V1.0｜2026 年 9 月 18 日', 4800, { fill: C.parchment })] }),
    ],
  }),
  spacer(500),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
    children: [textRun('供場地申請、執行協調與公開活動備查使用', { size: 18, color: C.muted })],
  }),
  pageBreak()
);

// Document control and summary
children.push(
  heading('文件摘要', HeadingLevel.HEADING_1),
  p('本計畫以「參與式藝術」為核心，透過身體打擊、聲音微動態辨識與 50 人集體節奏共創，讓參與者在 60 分鐘內從聆聽、選擇、回應到共同創作，理解 Groove 並非只存在於樂譜或技巧，而是由呼吸、重量轉移、肌肉回彈與群體協調共同形成。活動不收費，正式流程不攝錄影或直播，並以低音量、低衝擊、可替代動作及明確人流控管維護參與安全與場館品質。'),
  callout('本版校訂重點', [
    '一、統一「不攝錄影」原則：原稿末段的合照改為一輪集體節奏收束，避免與隱私承諾矛盾。',
    '二、強化身體自主與無障礙替代：拍胸、踏步均可改為拍腿、拍掌、坐姿或純聆聽，不以完成動作作為參與條件。',
    '三、補入個資最小化、保留期限、緊急應變、工作分工與成效指標，便於館方審查與執行交接。',
  ], 'brand'),
  spacer(140),
  heading('計畫一覽', HeadingLevel.HEADING_2),
  makeTable(infoRows, [2100, 6900]),
  heading('目錄', HeadingLevel.HEADING_1),
  new TableOfContents('目錄', {
    hyperlink: true,
    headingStyleRange: '1-3',
  }),
  pageBreak()
);

// Main content
children.push(
  heading('壹、企劃背景與當代藝術理念', HeadingLevel.HEADING_1),
  p('在現代打擊樂與音樂賞析日益普及的背景下，大眾在學習與感受音樂時，常過度依賴樂譜等視覺符號與單向技巧訓練，因而忽略身體感官與聲音動態（Groove）之間的本能連結。節奏不只是時間格線上的精準落點，也存在於呼吸、重心、肌肉張力、動作前後的留白，以及個體與群體之間的相互傾聽。'),
  p('本計畫由王苡丞發起，預定於具當代實驗與跨界精神的臺灣當代文化實驗場（C-LAB）多功能廳舉行。活動以「參與式藝術（Participatory Art）」為核心，結合身體打擊（Body Percussion）、聽覺微動態賞析與社群集體創作，打破傳統「台上演出、台下觀賞」的單向關係。參與者將自身身體視為第一件樂器，在 60 分鐘內經歷感知、模仿、辨識、協作與反思，形成可被共同感受的聲音場。'),
  p('C-LAB 作為跨領域文化實驗平台，與本計畫強調公共參與、身體經驗及非典型展演關係的方向相符。本活動不以技巧優劣為評判標準，而以「每個人都能帶著自己的身體進入節奏」為設計原則，讓專業音樂概念轉化為大眾可近、可回應、可共同完成的藝術經驗。'),
  heading('一、策展式命題', HeadingLevel.HEADING_2),
  callout('肢體感官大於視覺符號', [
    '參與者先透過身體重量、動作回彈與彼此傾聽理解節奏，再回看拍點與術語；讓知識從感官經驗中長出，而非要求身體追趕抽象符號。',
  ], 'sage'),
  spacer(130),
  heading('二、計畫目標', HeadingLevel.HEADING_2),
  numbered('建立零基礎可參與的節奏入口，降低大眾接觸現代打擊樂與 Groove 概念的門檻。'),
  numbered('以身體作為媒介，促進參與者對呼吸、張力、重量轉移與肌肉回彈的覺察。'),
  numbered('透過 50 人集體共創，讓觀眾由接收者轉化為共同作者，體驗群體節奏中的協商與共鳴。'),
  numbered('在公共文化空間中實踐低器材、低音量、可近用且尊重隱私的參與式藝術活動。'),
  numbered('形成可公開傳播的文字觀念摘要，延伸活動後的音樂藝術普及與社群對話。'),

  heading('三、核心成果指標', HeadingLevel.HEADING_2),
  makeTable([
    ['面向', '執行指標'],
    ['公共參與', '入場上限 50 人；線上預約與現場候補規則公開透明。'],
    ['體驗品質', '完成聆聽辨識、分組共創及雙向交流三種參與層次；參與者可自由選擇動作強度。'],
    ['安全與場館', '重大安全事件 0 件；消防通道暢通；15:30 前完成器材點交與場地復原。'],
    ['隱私與資料', '正式流程不攝錄；報名資料限活動聯繫使用，活動後 30 日內刪除可識別聯絡資料。'],
    ['成果推廣', '發布不含個資與可識別影像的文字／觀念摘要 1 篇。'],
  ], [2100, 6900]),

  heading('貳、活動基本資訊與組織架構', HeadingLevel.HEADING_1),
  makeTable(infoRows, [2100, 6900]),
  spacer(160),
  heading('一、工作分工', HeadingLevel.HEADING_2),
  makeTable([
    ['角色', '主要職責', '配置原則'],
    ['主辦／分享人：王苡丞', '內容設計、示範、主持、音量與節奏控制、現場問答。', '全程在場'],
    ['報到與人流工作人員', '核對名單、候補發號、道具發放回收、通道維護。', '建議至少 2 人'],
    ['場內安全協力', '觀察身體不適、協助替代動作、連繫館方與緊急應變。', '可由工作人員兼任；須事前分工'],
    ['音控／設備協力', '音檔播放、麥克風、音量監測與備援。', '依館方設備與人力確認'],
    ['館方窗口', '場地、消防、噪音、開關館與緊急程序協調。', '依館方指派'],
  ], [2100, 4900, 2000]),
  p('註：除主辦／分享人外，其餘人員姓名與聯絡方式於館方核准及執行會議後補入工作名冊；正式活動前完成一次全員安全與流程簡報。', { size: 18, color: C.muted, after: 100 }),

  heading('參、參與對象、入場與安全原則', HeadingLevel.HEADING_1),
  heading('一、參與對象與身體自主', HeadingLevel.HEADING_2),
  bullet('建議 12 歲以上一般大眾、音樂與表演藝術愛好者參與；未滿 12 歲者須由成年家長全程陪同。'),
  bullet('所有互動均採自願原則；參與者可選擇站姿、坐姿、降低幅度、改用拍腿／拍掌或純聆聽。'),
  bullet('涉及胸前輕拍的示範不作強制要求，分享人須同步示範拍腿或拍掌替代方案，避免身體界線與不適。'),
  bullet('活動不含跳躍、奔跑、拋接器材或人與人肢體接觸；需使用輔具者得依現場動線安排安全位置。'),
  heading('二、容納與入場規則', HeadingLevel.HEADING_2),
  numbered('現場總入場人數上限為 50 人，含線上預約及現場候補；依核定消防容量與館方規範辦理。'),
  numbered('線上預約者須於 13:50 前完成實名簽到；未完成者視同放棄，席位依序釋出。'),
  numbered('13:50 起由報到人員依候補號碼與剩餘席次叫號，額滿即停止發號並設置明確告示。'),
  numbered('14:15 起停止開放入場，避免進出干擾沉浸體驗；特殊情況由館方與主辦共同判斷。'),
  heading('三、場館維護規範', HeadingLevel.HEADING_2),
  bullet('廳內全程禁止飲食、吸菸及攜帶寵物；合格導盲犬或依法執勤之輔助犬不在此限。'),
  bullet('禁止攜帶危險物品、易燃物、液體或大型行李入場；個人物品不得阻塞走道或出口。'),
  bullet('音量須符合館方規範；線材使用護線槽或可靠固定，器材不得倚靠或懸掛於古蹟與館舍構件。'),
  bullet('建議穿著平底鞋與輕便服裝；如有暈眩、疼痛或不適應立即停止動作並告知工作人員。'),

  heading('肆、60 分鐘活動流程與執行內容', HeadingLevel.HEADING_1),
  makeTable(scheduleRows, [1250, 1600, 4850, 1300]),
  spacer(160),
  heading('一、開場與參與契約（14:00–14:10）', HeadingLevel.HEADING_2),
  p('分享人先以個人打擊樂創作與學習經驗建立脈絡，接著說明三項參與契約：不比較技巧、先傾聽再回應、任何動作皆可降低或退出。以拍掌、拍腿及靜默手勢帶領 4/4 拍 Call & Response，確認全場能辨識開始、停止與音量手勢。'),
  heading('二、聲音微動態賞析（14:10–14:25）', HeadingLevel.HEADING_2),
  p('以兩段相同速度、不同微動態的節奏示範「格線精準」與「Pocket」之差異。參與者以雙色卡回應哪一段較有推進、後坐或呼吸感，再由分享人引導描述感受，不以單一正解壓縮聽覺經驗。'),
  heading('三、集體感官共鳴（14:25–14:45）', HeadingLevel.HEADING_2),
  p('將現場分為低頻、中頻與高頻三組：低頻以踏步或拍大腿、中頻以拍掌或輕拍胸前替代、高頻以沙蛋構成。依「單組建立—兩組疊合—三組共創—動態退場」順序進行，分享人以手勢管理速度、密度與音量。每輪不超過 90 秒，輪次之間安排靜默重置與身體檢查。'),
  heading('四、對談、Q&A 與收束（14:45–15:00）', HeadingLevel.HEADING_2),
  p('邀請 2 位自願參與者示範，交流如何減少多餘張力、利用肌肉回彈與保持聲音連續。最後回應事前及現場提問各 1 題，歸納「身體先知道，符號再命名」的核心概念，並以全體一輪漸弱節奏收束。為維持隱私承諾，不安排合照或其他攝錄。'),

  heading('伍、空間、設備與技術需求', HeadingLevel.HEADING_1),
  makeTable(equipmentRows, [2100, 1000, 3800, 2100]),
  spacer(140),
  heading('一、建議空間配置', HeadingLevel.HEADING_2),
  bullet('入口區：名單、候補號碼牌、額滿告示與道具發放桌；不得侵占逃生通道。'),
  bullet('體驗區：參與者以三區或鬆散半圓配置，保留個人動作距離與至少一條通往出口的主走道。'),
  bullet('分享區：分享人、麥克風與播放設備集中於前方；線材不跨越參與者主要動線。'),
  bullet('安靜／替代參與位置：靠近出口或側邊安排可坐姿參與之位置，方便需要休息者進出。'),
  heading('二、場勘與彩排確認清單', HeadingLevel.HEADING_2),
  numbered('核定容量、出入口、消防設備、集合點、AED／急救箱與館方緊急聯絡方式。'),
  numbered('確認無線麥克風頻段、備用電池、示範音檔格式、播放設備與離線備份。'),
  numbered('進行三組節奏疊加試音，記錄館方可接受之操作範圍與立即降音手勢。'),
  numbered('確認桌椅、輪椅位置、器材暫存、垃圾處理、撤場路線及場地點交方式。'),

  heading('陸、報名、候補與個人資料管理', HeadingLevel.HEADING_1),
  heading('一、公開報名機制', HeadingLevel.HEADING_2),
  bullet('採公開網址報名，每筆可登記 1–2 人；登記 2 人時須填寫同行者姓名，確保實名與席次一致。'),
  bullet('系統依席次自動標示正取或候補；同一筆 2 人報名如剩餘 1 席，整筆列為候補，避免拆分同行者。'),
  bullet('送出後寄發結果與活動提醒；報名者應於 13:50 前完成簽到，逾時席位依序釋出。'),
  bullet('推薦來源與公開提問為選填；不蒐集與活動無直接必要之學生編號或抽獎資料。'),
  heading('二、表單欄位', HeadingLevel.HEADING_2),
  makeTable([
    ['欄位', '必要性', '用途'],
    ['姓名、同行者姓名', '必填／條件必填', '實名報到與席次管理'],
    ['聯絡電話', '必填', '緊急異動或活動當日聯繫'],
    ['電子郵件', '必填', '寄送正取／候補與活動提醒'],
    ['參與人數', '必填', '容量控管（限 1 或 2 人）'],
    ['節奏／肢體提問', '選填', '現場 Q&A 題目蒐集'],
    ['推薦來源', '選填', '匿名宣傳成效統計'],
    ['無障礙或參與協助需求', '選填', '安排替代動作與位置'],
    ['規範與隱私同意', '必填', '確認年齡陪同、入場與資料使用規則'],
  ], [2600, 1700, 4700]),
  spacer(120),
  heading('三、個資與隱私承諾', HeadingLevel.HEADING_2),
  bullet('蒐集目的限於報名審核、席次控管、活動通知、現場報到與必要安全聯繫。'),
  bullet('可識別資料僅由主辦與必要工作人員存取，不公開、不出售，也不作與本活動無關之行銷。'),
  bullet('活動結束後 30 日內刪除姓名、電話、電子郵件及協助需求等可識別資料；僅保留去識別化統計。'),
  bullet('參與者可透過 cn922082000@gmail.com 申請查詢、更正、取消或刪除資料。'),
  callout('上線前必要設定', [
    'HTML 報名頁已預留 Google Apps Script／Google 試算表後端。正式開放前須設定收件端點、試算表權限與 50 席容量，確認主辦聯絡信箱為 cn922082000@gmail.com，並完成一筆真實測試後刪除測試資料。',
  ], 'warning'),

  heading('柒、風險控管與緊急應變', HeadingLevel.HEADING_1),
  makeTable(riskRows, [1900, 3300, 3800]),
  spacer(150),
  heading('一、緊急處置共通原則', HeadingLevel.HEADING_2),
  numbered('發現危險或不適時，任何工作人員均可直接示意停止；分享人立即停止聲音與動作。'),
  numbered('優先確保人員安全與通道暢通，再處理器材；不在未受訓情況下進行超出能力的醫療處置。'),
  numbered('依館方指揮完成通報、疏散、急救或復原；必要時撥打 119，並指定人員至入口引導救援。'),
  numbered('活動後記錄事件時間、位置、處置與後續，避免在公開紀錄中揭露不必要個資。'),
  heading('二、活動調整或中止條件', HeadingLevel.HEADING_2),
  bullet('館方要求、設備故障造成安全疑慮、群眾無法有效控管、持續超出音量規範，或天災／公共安全情勢不宜繼續。'),
  bullet('如僅部分環節受影響，優先改為坐姿、無聲手勢、雙色卡或問答；無法確保安全時立即中止。'),

  heading('捌、宣傳、公共參與與成果運用', HeadingLevel.HEADING_1),
  heading('一、事前公開參與', HeadingLevel.HEADING_2),
  bullet('以 GitHub Pages 報名頁公開活動理念、時程、地點、名額、候補、年齡與隱私規則。'),
  bullet('表單設置公開議題徵集，邀請民眾提出節奏、聽覺或肢體瓶頸，作為 Q&A 題庫。'),
  bullet('宣傳文案明確標示非收費、正式流程不攝錄影、活動包含輕度肢體律動及可替代動作。'),
  heading('二、現場公共性', HeadingLevel.HEADING_2),
  bullet('線上預約未報到席位於 13:50 釋出予園區現場候補民眾，兼顧可預期性與公共空間開放。'),
  bullet('以雙色卡、節奏回應、分組共創與現場問答建立多層次參與，不要求音樂背景。'),
  heading('三、事後成果', HeadingLevel.HEADING_2),
  bullet('整理「文字與觀念分享摘要」，內容可包含活動方法、匿名提問主題與分享人反思。'),
  bullet('不發布參與者姓名、聯絡資訊、可識別故事或未經同意之影像；本活動原則上不產製現場影像。'),

  heading('玖、前置時程與現場工作表', HeadingLevel.HEADING_1),
  makeTable([
    ['期程', '工作內容', '完成標準'],
    ['活動前 8–10 週', '送交場地申請、確認日期與館方需求；完成工作人員邀集。', '取得核准或修正意見'],
    ['活動前 6 週', '完成報名頁後端、個資告知、宣傳文案與主視覺；開放報名。', '成功測試收件與回信'],
    ['活動前 3–4 週', '場勘、動線、設備、消防與無障礙位置確認。', '完成場勘紀錄與配置圖'],
    ['活動前 1–2 週', '檢查報名名單、候補規則、道具與備品；寄發提醒。', '道具完成點交與清潔'],
    ['活動前 1 日', '下載離線名單、備份音檔、充電與電池檢查、工作人員簡報。', '完成最終檢核表'],
    ['活動當日 12:30–13:30', '進場、佈置、試音、動線與安全確認。', '13:30 準時開放'],
    ['15:00–15:30', '道具回收、清潔、器材與場地點交。', '館方確認復原'],
    ['活動後 7 日內', '完成匿名摘要、內部檢討與設備盤點。', '公開摘要 1 篇'],
    ['活動後 30 日內', '刪除可識別報名資料，保留去識別統計。', '完成資料清理紀錄'],
  ], [1900, 4800, 2300]),
  spacer(140),
  heading('活動當日關鍵時間點', HeadingLevel.HEADING_2),
  makeTable([
    ['時間', '任務', '檢核'],
    ['12:30', '工作人員進場、場地點交', '□'],
    ['12:45', '器材架設、線材固定、道具盤點', '□'],
    ['13:00', '試音、分貝與節奏手勢彩排', '□'],
    ['13:15', '緊急程序與人流角色確認', '□'],
    ['13:30', '開放預約報到與候補排隊', '□'],
    ['13:50', '釋出未報到席位', '□'],
    ['14:00', '活動開始', '□'],
    ['14:15', '停止開放入場', '□'],
    ['15:00', '活動結束、開始撤場', '□'],
    ['15:30', '場地復原與點交完成', '□'],
  ], [1500, 6300, 1200]),

  heading('拾、館方配合承諾', HeadingLevel.HEADING_1),
  bullet('本活動不收費；不於正式流程進行攝影、錄影或直播。'),
  bullet('遵守館方核定容量、消防、噪音、古蹟維護、進撤場與人員管理規定；如館方規範較本計畫嚴格，以館方規範為準。'),
  bullet('活動前完成工作人員分工、設備測試與緊急流程確認；活動期間指定窗口與館方保持聯繫。'),
  bullet('活動結束後立即回收道具、清潔並復原場地；若發現設施異常或損害，立即通報並配合處理。'),
  bullet('公開文案、報名頁與事後摘要均尊重參與者個資與隱私，不作超出告知目的之使用。'),

  heading('附錄一、公開報名頁文案', HeadingLevel.HEADING_1),
  p('《Rhythm in Motion｜把節奏裝進身體》爵士鼓律動與肢體表達經驗分享會', { bold: true, size: 25, alignment: AlignmentType.LEFT }),
  p('看譜打得很準，卻總覺得少了點 Groove？練習時越打越緊繃，身體總是鬆不開？本活動由王苡丞發起，邀請你來到臺灣當代文化實驗場（C-LAB），用「身體打擊 × 聽覺對話」，在 60 分鐘內感受聲音的動態與群體共鳴。無須打擊樂經驗，動作可依個人狀況調整。本活動不收費，正式流程不攝錄影或直播。'),
  labelValue('時間', '2026/11/28（六）14:00–15:00；13:30 開放入場'),
  labelValue('地點', 'C-LAB 多功能廳（臺北市大安區建國南路一段 177 號）'),
  labelValue('人數', '限額 50 人；13:50 未簽到席位釋出予現場候補'),
  labelValue('提醒', '14:15 起停止入場；建議穿著平底鞋與方便活動的服裝'),
  labelValue('參與方式', '站姿、坐姿、替代動作或純聆聽皆可'),

  pageBreak(),
  heading('附錄二、上線前核對清單', HeadingLevel.HEADING_1),
  compactNumbered('確認場地核准名稱、廳別、地址、日期、進撤場時間與最大容量。'),
  compactNumbered('確認主辦聯絡信箱與個資查詢／刪除窗口為 cn922082000@gmail.com。'),
  compactNumbered('部署 Google Apps Script，填入試算表 ID、主辦信箱、容量 50，並將 Web App 網址寫入網站 config.js。'),
  compactNumbered('以 1 人及 2 人各送一筆測試，確認正取／候補判斷、試算表資料、通知信與重複送出保護。'),
  compactNumbered('完成手機與桌機檢視、鍵盤操作、必填欄位、錯誤提示及螢幕閱讀器標籤檢查。'),
  compactNumbered('正式開放前清除測試資料，將網站狀態由 preview 改為 open，並再次確認公開網址。'),
  compactNumbered('活動後 30 日內執行資料清理並保留完成紀錄。'),
  spacer(300),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 80 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: C.terracotta, space: 10 } },
    children: [textRun('— 文件結束 —', { bold: true, color: C.terracotta, size: 20 })],
  })
);

const doc = new Document({
  creator: '王苡丞',
  title: 'Rhythm in Motion｜把節奏裝進身體｜正式計畫書',
  subject: '跨界音樂與肢體藝術分享會計畫',
  description: 'C-LAB 多功能廳場地申請與活動執行計畫',
  keywords: 'Rhythm in Motion, C-LAB, 身體打擊, Groove, 參與式藝術',
  lastModifiedBy: 'Hermes Agent',
  styles: {
    default: {
      document: {
        run: { font: FONT, size: BODY_SIZE, color: C.ink },
        paragraph: { spacing: { line: 340, after: 140 } },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: FONT, size: 31, bold: true, color: C.terracotta },
        paragraph: {
          outlineLevel: 0,
          keepNext: true,
          keepLines: true,
          spacing: { before: 360, after: 180 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: C.terracotta, space: 8 } },
        },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: FONT, size: 25, bold: true, color: C.sage },
        paragraph: { outlineLevel: 1, keepNext: true, keepLines: true, spacing: { before: 240, after: 120 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: FONT, size: 22, bold: true, color: C.ink },
        paragraph: { outlineLevel: 2, keepNext: true, keepLines: true, spacing: { before: 180, after: 100 } },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'rim-bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 220 } }, run: { font: FONT, color: C.terracotta } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: '◦',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 220 } }, run: { font: FONT, color: C.sage } },
          },
        ],
      },
      {
        reference: 'rim-decimal',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 420, hanging: 260 } }, run: { font: FONT, bold: true, color: C.terracotta } },
          },
          {
            level: 1,
            format: LevelFormat.LOWER_LETTER,
            text: '%2.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 780, hanging: 260 } }, run: { font: FONT, color: C.sage } },
          },
        ],
      },
    ],
  },
  features: { updateFields: true },
  sections: [
    {
      properties: {
        titlePage: true,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1220, bottom: 1080, left: 1220, header: 540, footer: 540 },
        },
      },
      headers: {
        first: new Header({ children: [] }),
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line, space: 5 } },
              spacing: { after: 80 },
              children: [
                textRun('RHYTHM IN MOTION', { bold: true, size: 16, color: C.terracotta, characterSpacing: 70 }),
                textRun('  ｜  把節奏裝進身體・正式計畫書', { size: 16, color: C.muted }),
              ],
            }),
          ],
        }),
      },
      footers: {
        first: new Footer({ children: [] }),
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 5 } },
              spacing: { before: 80, after: 0 },
              children: [
                textRun('王苡丞｜2026.11.28  ·  ', { size: 16, color: C.muted }),
                textRun('第 ', { size: 16, color: C.muted }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: C.terracotta, bold: true }),
                textRun(' 頁', { size: 16, color: C.muted }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc)
  .then((buffer) => {
    fs.writeFileSync(OUT_FILE, buffer);
    console.log(`Wrote ${OUT_FILE}`);
    console.log(`Bytes ${buffer.length}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
