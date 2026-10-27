import pptxgen from "pptxgenjs";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5

// ---------- Palette: Midnight Executive ----------
const NAVY = "1E2761";
const ICE = "CADCFC";
const WHITE = "FFFFFF";
const TEAL = "1C7293";
const AMBER = "C77B00";
const SLATE = "444B66";
const LIGHTBG = "F4F6FB";
const OK_GREEN = "2C6B4F";
const WARN_AMBER = "8A5A00";

const TITLE_FONT = "Cambria";
const BODY_FONT = "Calibri";

// ============================================================
// SLIDE 1 — Previous export vs New export: issue comparison
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: WHITE };

  slide.addText("Publication Data: Previous vs New Export", {
    x: 0.5, y: 0.35, w: 12.3, h: 0.7,
    fontFace: TITLE_FONT, fontSize: 30, bold: true, color: NAVY, isTextBox: true, margin: 0,
  });
  slide.addText("Recurring vs newly surfaced data-quality issues across the two Pub Mine exports", {
    x: 0.5, y: 1.0, w: 12.3, h: 0.4,
    fontFace: BODY_FONT, fontSize: 14, color: SLATE, italic: true, isTextBox: true, margin: 0,
  });

  const header = ["Issue", "Previous Export", "New Export", "Status"];
  const rows = [
    ["6 fully-null columns\n(HOME FACULTY, HOME STAFF, etc.)", "Found & removed", "Reappeared\n(fresh export)", "Fixed again"],
    ["MONTH = 0 (invalid month)", "Found & dropped", "1,176 rows", "Fixed again"],
    ["\"Centre for Material Science\"\nnaming split", "Found & merged", "Reappeared\n(11 vs 249 rows)", "Fixed again"],
    ["Duplicate publication titles", "Not reviewed", "35 groups / 74 rows", "Catalogued"],
    ["Duplicate DOIs", "Not reviewed", "24 rows / 12 DOIs", "Catalogued"],
    ["Orphan faculty IDs in\nAUTHOR ADDRESS", "25 IDs", "25 IDs (unchanged)", "Open"],
    ["ABDC grade whitespace\n( \"A\" vs \"A \" )", "Present", "Present", "Open"],
    ["Institute/department\nmapping anomalies", "Present", "Present", "Partly fixed\n(taxonomy rebuild)"],
  ];

  const tableRows = [
    header.map((h) => ({
      text: h,
      options: { bold: true, color: WHITE, fill: { color: NAVY }, fontFace: BODY_FONT, fontSize: 12.5, align: "left", valign: "middle" },
    })),
  ];

  const statusColor = (s) => {
    if (s.startsWith("Fixed")) return OK_GREEN;
    if (s.startsWith("Open")) return "B03A2E";
    if (s.startsWith("Catalogued")) return WARN_AMBER;
    if (s.startsWith("Partly")) return TEAL;
    return SLATE;
  };

  rows.forEach((r, i) => {
    const fill = i % 2 === 0 ? WHITE : LIGHTBG;
    tableRows.push([
      { text: r[0], options: { color: NAVY, fill: { color: fill }, fontFace: BODY_FONT, fontSize: 11.5, bold: true, align: "left", valign: "middle" } },
      { text: r[1], options: { color: SLATE, fill: { color: fill }, fontFace: BODY_FONT, fontSize: 11.5, align: "left", valign: "middle" } },
      { text: r[2], options: { color: SLATE, fill: { color: fill }, fontFace: BODY_FONT, fontSize: 11.5, align: "left", valign: "middle" } },
      { text: r[3], options: { color: statusColor(r[3]), fill: { color: fill }, fontFace: BODY_FONT, fontSize: 11.5, bold: true, align: "left", valign: "middle" } },
    ]);
  });

  slide.addTable(tableRows, {
    x: 0.5, y: 1.6, w: 12.3, h: 5.4,
    colW: [3.7, 2.6, 2.9, 3.1],
    border: { type: "solid", color: "DCE1EC", pt: 0.75 },
    autoPage: false,
  });

  slide.addText("Source: Pub_Mine_export1786420428418.xlsx (7,061 rows) compared against the earlier cleaned export", {
    x: 0.5, y: 7.12, w: 12.3, h: 0.3,
    fontFace: BODY_FONT, fontSize: 9.5, color: "8A93A8", isTextBox: true, margin: 0,
  });
}

// ============================================================
// SLIDE 2 — New file issues + fixes applied
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: WHITE };

  slide.addText("New Publication File — Issues Found & Fixes Applied", {
    x: 0.5, y: 0.35, w: 12.3, h: 0.7,
    fontFace: TITLE_FONT, fontSize: 30, bold: true, color: NAVY, isTextBox: true, margin: 0,
  });
  slide.addText("7,061 rows audited — every fix applied is documented, nothing silently dropped", {
    x: 0.5, y: 1.0, w: 12.3, h: 0.4,
    fontFace: BODY_FONT, fontSize: 14, color: SLATE, italic: true, isTextBox: true, margin: 0,
  });

  const header = ["Issue", "What Was Happening", "Fix Applied"];
  const rows = [
    ["6 fully-null columns", "HOME FACULTY, HOME SCHOLAR, HOME STAFF, CORRESPONDING AUTHOR, THE, CREATED DATE — 100% empty across all 7,061 rows", "Removed from final dataset"],
    ["MONTH = 0", "1,176 rows had an invalid month value with no source date to back it", "Column dropped; YEAR retained"],
    ["CMS department\nnaming split", "\"Centre for Material Science\" (11 rows) vs \"...(CMS)\" (249 rows) — same department, fragmenting every count", "Merged into one canonical name"],
    ["Institute taxonomy\nmismatch", "Old 18-institute structure vs the university's new 8-institute restructuring", "Rebuilt institutes/departments\nin Supabase (8 / 42)"],
    ["Digital Electronics\nmis-mapped", "Majority-vote logic had filed it under Computer Science instead of Electronics", "Corrected to Electrical &\nElectronics Engineering"],
    ["25 orphan faculty IDs", "IDs embedded in AUTHOR ADDRESS with no matching row in the 739-faculty roster", "Excluded from the\nfaculty_publications junction"],
    ["Broken row rendering\n(earlier file version)", "Long abstract text was causing uneven, oversized row heights on load", "Rebuilt with uniform row\nheight, wrap disabled"],
  ];

  const tableRows = [
    header.map((h) => ({
      text: h,
      options: { bold: true, color: WHITE, fill: { color: TEAL }, fontFace: BODY_FONT, fontSize: 12.5, align: "left", valign: "middle" },
    })),
  ];

  rows.forEach((r, i) => {
    const fill = i % 2 === 0 ? WHITE : LIGHTBG;
    tableRows.push([
      { text: r[0], options: { color: NAVY, fill: { color: fill }, fontFace: BODY_FONT, fontSize: 11, bold: true, align: "left", valign: "middle" } },
      { text: r[1], options: { color: SLATE, fill: { color: fill }, fontFace: BODY_FONT, fontSize: 10.5, align: "left", valign: "middle" } },
      { text: r[2], options: { color: OK_GREEN, fill: { color: fill }, fontFace: BODY_FONT, fontSize: 10.5, bold: true, align: "left", valign: "middle" } },
    ]);
  });

  slide.addTable(tableRows, {
    x: 0.5, y: 1.6, w: 12.3, h: 5.4,
    colW: [2.6, 6.2, 3.5],
    border: { type: "solid", color: "DCE1EC", pt: 0.75 },
    autoPage: false,
  });

  slide.addText("Still open (flagged, not yet fixed): 15-row HOME AUTHOR SCHOOL misalignment · ABDC whitespace · duplicate titles/DOIs — see backlog", {
    x: 0.5, y: 7.12, w: 12.3, h: 0.3,
    fontFace: BODY_FONT, fontSize: 9.5, color: "8A93A8", isTextBox: true, margin: 0,
  });
}

// ============================================================
// SLIDE 3 — Next Steps: journey flow
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: NAVY };

  slide.addText("Next Steps", {
    x: 0.6, y: 0.4, w: 8, h: 0.7,
    fontFace: TITLE_FONT, fontSize: 32, bold: true, color: WHITE, isTextBox: true, margin: 0,
  });
  slide.addText("From clean data to a validated, demo-ready agent", {
    x: 0.6, y: 1.05, w: 10, h: 0.4,
    fontFace: BODY_FONT, fontSize: 14, color: ICE, italic: true, isTextBox: true, margin: 0,
  });

  const steps = [
    { n: "1", title: "Re-link Faculty Profiles", desc: "Reattach department_id / institute_id / faculty_id per user against the rebuilt taxonomy" },
    { n: "2", title: "Update Agent Tools", desc: "Refresh DEPT_ABBREV dictionary and institute references in ria_tools_groq.py" },
    { n: "3", title: "Validate RLS & Access", desc: "Confirm anon read policies resolve correctly on the rebuilt tables" },
    { n: "4", title: "Run Test-Query Suite", desc: "Re-run categorized natural-language queries across all 4 role levels" },
    { n: "5", title: "Close Remaining Issues", desc: "ABDC whitespace, duplicate DOIs, HOME AUTHOR SCHOOL misalignment" },
    { n: "6", title: "Demo Prep for PC Sir", desc: "Final walkthrough and stakeholder sign-off on live data" },
  ];

  const startX = 0.6;
  const gap = 2.05;
  const boxW = 1.85;
  const boxY = 2.2;
  const boxH = 3.6;
  const circleY = boxY - 0.55;

  steps.forEach((s, i) => {
    const x = startX + i * gap;

    // connecting arrow (between circles), not on the first
    if (i > 0) {
      slide.addShape("line", {
        x: x - gap + 0.42, y: circleY + 0.28, w: gap - 0.56, h: 0,
        line: { color: ICE, width: 1.5, dashType: "solid", endArrowType: "triangle" },
      });
    }

    // step number circle
    slide.addShape("ellipse", {
      x: x, y: circleY, w: 0.56, h: 0.56,
      fill: { color: i % 2 === 0 ? TEAL : AMBER },
      line: { type: "none" },
    });
    slide.addText(s.n, {
      x: x, y: circleY, w: 0.56, h: 0.56,
      fontFace: BODY_FONT, fontSize: 18, bold: true, color: WHITE,
      align: "center", valign: "middle", isTextBox: true, margin: 0,
    });

    // card
    slide.addShape("roundRect", {
      x: x - 0.15, y: boxY, w: boxW, h: boxH,
      rectRadius: 0.08,
      fill: { color: "26306B" },
      line: { type: "none" },
    });

    slide.addText(s.title, {
      x: x - 0.05, y: boxY + 0.2, w: boxW - 0.2, h: 0.9,
      fontFace: BODY_FONT, fontSize: 13, bold: true, color: WHITE,
      align: "left", valign: "top", isTextBox: true, margin: 0,
    });
    slide.addText(s.desc, {
      x: x - 0.05, y: boxY + 1.15, w: boxW - 0.2, h: boxH - 1.35,
      fontFace: BODY_FONT, fontSize: 10, color: ICE,
      align: "left", valign: "top", isTextBox: true, margin: 0,
    });
  });

  slide.addText("Target: fully validated agent + live dashboard walkthrough", {
    x: 0.6, y: 6.15, w: 11, h: 0.4,
    fontFace: BODY_FONT, fontSize: 12, italic: true, color: ICE, isTextBox: true, margin: 0,
  });
}

pres.writeFile({ fileName: "RIA_Progress_Update.pptx" }).then(() => {
  console.log("done");
});