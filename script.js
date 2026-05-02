const appState = {
  currentMode: "home",
  route: { page: "dashboard" },
  navigationHistory: [],
  searchTerm: "",
  filters: {
    subject: "",
    stream: "",
    chapter: "",
  },
  message: null,
  isSubmittingUpload: false,
  admin: {
    loggedIn: false,
    section: "subjects",
    modal: null,
    userEmail: "",
    userId: "",
    role: "guest",
    canUpload: false,
  },
  backend: {
    supabaseReady: false,
    usingFallbackData: true,
    lastError: "",
  },
  theme: "light",
  settings: {
    id: null,
    heroEyebrow: "NOVA",
    heroTitle: "Network for Organization, Vision, and Academics",
    heroCopy: "Organize smarter, stay aligned with your academic goals, and keep every subject update in one clean student workspace.",
  },
  assignments: [
    {
      id: 1,
      chapter: "Mathematics Part 1 Chapter 1",
      subject: "Mathematics Part 1",
      deadline: "28 Apr 2026",
      title: "Limits and Continuity Sheet",
      questionLink: "https://example.com/maths-part-1-question.pdf",
      solutionLink: "https://example.com/maths-part-1-solution.pdf",
    },
  ],
  subjects: [
    { id: 1, slug: "mathematics-part-1", name: "Mathematics Part 1", accent: "M1", description: "Core concepts, formulas, and solved examples." },
    { id: 2, slug: "mathematics-part-2", name: "Mathematics Part 2", accent: "M2", description: "Advanced practice sets and chapter-wise revision." },
    { id: 3, slug: "physics", name: "Physics", accent: "P", description: "Theory notes and practical files together." },
    { id: 4, slug: "iks", name: "IKS", accent: "IKS", description: "Indian Knowledge Systems notes and reference material." },
    { id: 5, slug: "english", name: "English", accent: "EN", description: "Grammar, prose, writing, and daily reading topics." },
  ],
  chapters: [
    { id: 1, subject: "Mathematics Part 1", stream: "Theory", chapterName: "Chapter 1", chapterOrder: 1 },
    { id: 2, subject: "Mathematics Part 1", stream: "Theory", chapterName: "Chapter 2", chapterOrder: 2 },
    { id: 3, subject: "Mathematics Part 2", stream: "Theory", chapterName: "Chapter 1", chapterOrder: 1 },
    { id: 4, subject: "Physics", stream: "Theory", chapterName: "Chapter 1", chapterOrder: 1 },
    { id: 5, subject: "Physics", stream: "Practical", chapterName: "Chapter 1", chapterOrder: 1 },
    { id: 6, subject: "IKS", stream: "Theory", chapterName: "Chapter 1", chapterOrder: 1 },
    { id: 7, subject: "English", stream: "Theory", chapterName: "Chapter 1", chapterOrder: 1 },
  ],
  uploads: [
    {
      id: 1,
      subject: "Mathematics Part 1",
      stream: "Theory",
      chapter: "Chapter 1",
      topic: "Sets and Relations",
      noticeTitle: "Mathematics Part 1 Daily Notes",
      date: "26 Apr 2026",
      pdfLink: "https://example.com/maths-part-1-notes.pdf",
    },
  ],
};

const BRAND = {
  name: "Nova",
  fullName: "Network for Organization, Vision, and Academics",
  tagline: "Organize smarter. Study clearer. Move ahead with confidence.",
};
const NOTE_STREAM_OPTIONS = ["Theory", "Practical"];
const UPLOAD_STREAM_OPTIONS = [...NOTE_STREAM_OPTIONS, "PYQ"];

const app = document.getElementById("app");
const config = window.APP_CONFIG || {};
let backendClient = null;
let accountClient = null;
let tablesClient = null;
let remoteRefreshTimer = null;
let remoteRefreshInFlight = false;
let AppwriteSdk = null;
let QueryHelpers = null;
let IdHelpers = null;
const noticeTitleOptions = [
  "Daily Notes",
  "Lecture PDF",
  "Practice Sheet",
  "Assignment Material",
  "Revision Notes",
  "Practical File",
  "Reference Module",
];

document.title = `${BRAND.name} | ${BRAND.fullName}`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatLabel(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (upper === "IKS" || upper === "EN") {
        return upper;
      }

      if (/^\d+$/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function formatDateLabel(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = String(value).trim().match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, monthLabel, year] = match;
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(monthLabel.toLowerCase());

  if (monthIndex === -1) {
    return null;
  }

  return new Date(Number(year), monthIndex, Number(day));
}

function getDateKey(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPendingAssignmentsCount() {
  const today = parseDateValue(new Date());
  today.setHours(0, 0, 0, 0);

  return appState.assignments.filter((assignment) => {
    const deadline = parseDateValue(assignment.deadline || assignment.deadlineLabel);
    if (!deadline) {
      return true;
    }

    deadline.setHours(0, 0, 0, 0);
    return deadline >= today;
  }).length;
}

function getTodaysNoticesCount() {
  const todayKey = getDateKey(new Date());
  return appState.uploads.filter((upload) => getDateKey(upload.date) === todayKey).length;
}

function setMessage(type, text) {
  appState.message = { type, text };
}

function clearMessage() {
  appState.message = null;
}

function getStoredTheme() {
  try {
    return window.localStorage.getItem("clgapp-theme") || "light";
  } catch (error) {
    return "light";
  }
}

function applyTheme(theme) {
  appState.theme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = appState.theme;

  try {
    window.localStorage.setItem("clgapp-theme", appState.theme);
  } catch (error) {
    console.error(error);
  }
}

function toggleTheme() {
  applyTheme(appState.theme === "dark" ? "light" : "dark");
  render();
}

function hasBackendConfig() {
  return Boolean(config.appwriteEndpoint && config.appwriteProjectId && window.Appwrite);
}

function isAdminUid(uid) {
  return Boolean(config.adminUserId && uid && uid === config.adminUserId);
}

function isUploaderUid(uid) {
  return Array.isArray(config.uploaderUserIds) && config.uploaderUserIds.includes(uid);
}

async function fetchUserRole(uid) {
  if (isAdminUid(uid)) {
    return "admin";
  }

  if (isUploaderUid(uid)) {
    return "uploader";
  }

  return "guest";
}

function getGeneratedNotices() {
  return appState.uploads.map((upload, index) => ({
    id: `${upload.subject}-${upload.chapter}-${index}`,
    title: upload.noticeTitle,
    topic: upload.topic,
    chapter: upload.chapter,
    subject: upload.subject,
    message: `${upload.noticeTitle} uploaded`,
    date: upload.date,
    pdfLink: upload.pdfLink || "",
  }));
}

function isPyqStream(streamName) {
  return streamName === "PYQ";
}

function normalizeUploadChapter(streamName, chapterName) {
  return isPyqStream(streamName) ? "PYQ" : chapterName;
}

function formatUploadLocation(upload) {
  return [upload.subject, upload.stream, isPyqStream(upload.stream) ? "" : upload.chapter]
    .filter(Boolean)
    .join(" - ");
}

function getPyqUploads(subjectName) {
  return appState.uploads.filter(
    (upload) => upload.subject === subjectName && isPyqStream(upload.stream)
  );
}

function getSubjectStreams(subjectName) {
  return NOTE_STREAM_OPTIONS.map((stream) => {
    const chapterCount = appState.chapters.filter(
      (chapter) => chapter.subject === subjectName && chapter.stream === stream
    ).length;

    return {
      name: stream,
      count: chapterCount,
      description:
        stream === "Theory"
          ? "Notes, explanation files, and chapter learning material."
          : "Lab records, practice files, and activity content.",
    };
  });
}

function getChapters(subjectName, streamName) {
  if (isPyqStream(streamName)) {
    return [];
  }

  return appState.chapters
    .filter((chapter) => chapter.subject === subjectName && chapter.stream === streamName)
    .sort((a, b) => a.chapterOrder - b.chapterOrder)
    .map((chapter) => ({
      name: chapter.chapterName,
      topics: appState.uploads.filter(
        (upload) =>
          upload.subject === subjectName &&
          upload.stream === streamName &&
          upload.chapter === chapter.chapterName
      ).length,
      latestDate:
        appState.uploads.find(
          (upload) =>
            upload.subject === subjectName &&
            upload.stream === streamName &&
            upload.chapter === chapter.chapterName
        )?.date || "",
    }));
}

function getTopics(subjectName, streamName, chapterName) {
  return appState.uploads.filter(
    (upload) =>
      upload.subject === subjectName &&
      upload.stream === streamName &&
      upload.chapter === chapterName
  );
}

function getFilteredUploads() {
  return appState.uploads.filter((upload) => {
    const subjectMatch = !appState.filters.subject || upload.subject === appState.filters.subject;
    const streamMatch = !appState.filters.stream || upload.stream === appState.filters.stream;
    const chapterMatch = !appState.filters.chapter || upload.chapter === appState.filters.chapter;
    return subjectMatch && streamMatch && chapterMatch;
  });
}

function renderMessage() {
  if (!appState.message) {
    return "";
  }

  return `<div class="message-banner ${escapeHtml(appState.message.type)}">${escapeHtml(appState.message.text)}</div>`;
}

function getAdminModalConfig() {
  if (!appState.admin.modal) {
    return null;
  }

  if (appState.admin.modal.type === "subject") {
    return appState.subjects.find((item) => item.id === appState.admin.modal.id) || null;
  }

  if (appState.admin.modal.type === "chapter") {
    return appState.chapters.find((item) => item.id === appState.admin.modal.id) || null;
  }

  if (appState.admin.modal.type === "assignment") {
    return appState.assignments.find((item) => item.id === appState.admin.modal.id) || null;
  }

  if (appState.admin.modal.type === "upload") {
    return appState.uploads.find((item) => item.id === appState.admin.modal.id) || null;
  }

  return null;
}

function renderAdminModal() {
  if (!appState.admin.modal) {
    return "";
  }

  const item = getAdminModalConfig();
  const type = appState.admin.modal.type;

  if (!item) {
    return "";
  }

  if (type === "subject") {
    return `
      <div class="modal-backdrop" onclick="closeAdminModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="section-head">
            <div>
              <h2>Edit Subject</h2>
              <p>Update the subject card details.</p>
            </div>
            <button class="btn ghost" type="button" onclick="closeAdminModal()">Close</button>
          </div>
          <form id="modalSubjectForm" class="form-grid">
            <div class="field">
              <label for="modalSubjectName">Subject Name</label>
              <input id="modalSubjectName" name="subjectName" value="${escapeHtml(item.name)}">
            </div>
            <div class="field">
              <label for="modalSubjectAccent">Accent</label>
              <input id="modalSubjectAccent" name="subjectAccent" value="${escapeHtml(item.accent)}">
            </div>
            <div class="field full">
              <label for="modalSubjectDescription">Description</label>
              <input id="modalSubjectDescription" name="subjectDescription" value="${escapeHtml(item.description)}">
            </div>
            <div class="field full">
              <button class="btn primary" type="submit">Update Subject</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === "chapter") {
    return `
      <div class="modal-backdrop" onclick="closeAdminModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="section-head">
            <div>
              <h2>Edit Chapter</h2>
              <p>Update chapter details and order.</p>
            </div>
            <button class="btn ghost" type="button" onclick="closeAdminModal()">Close</button>
          </div>
          <form id="modalChapterForm" class="form-grid">
            <div class="field">
              <label for="modalChapterSubject">Subject</label>
              <select id="modalChapterSubject" name="chapterSubject">
                <option value="">Select subject</option>
                ${renderSelectOptions(getSubjectOptions(), item.subject)}
              </select>
            </div>
            <div class="field">
              <label for="modalChapterStream">Type</label>
              <select id="modalChapterStream" name="chapterStream">
                <option value="">Select type</option>
                ${renderSelectOptions(NOTE_STREAM_OPTIONS, item.stream)}
              </select>
            </div>
            <div class="field">
              <label for="modalChapterName">Chapter Name</label>
              <input id="modalChapterName" name="chapterName" value="${escapeHtml(item.chapterName)}">
            </div>
            <div class="field">
              <label for="modalChapterOrder">Chapter Order</label>
              <input id="modalChapterOrder" name="chapterOrder" type="number" min="1" value="${escapeHtml(item.chapterOrder)}">
            </div>
            <div class="field full">
              <button class="btn primary" type="submit">Update Chapter</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === "assignment") {
    return `
      <div class="modal-backdrop" onclick="closeAdminModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="section-head">
            <div>
              <h2>Edit Assignment</h2>
              <p>Update title, deadline, question PDF, and solution PDF.</p>
            </div>
            <button class="btn ghost" type="button" onclick="closeAdminModal()">Close</button>
          </div>
          <form id="modalAssignmentForm" class="form-grid">
            <div class="field">
              <label for="modalAssignmentSubject">Subject</label>
              <select id="modalAssignmentSubject" name="assignmentSubject">
                <option value="">Select subject</option>
                ${renderSelectOptions(getSubjectOptions(), item.subject)}
              </select>
            </div>
            <div class="field">
              <label for="modalAssignmentChapter">Chapter</label>
              <select id="modalAssignmentChapter" name="assignmentChapter">
                <option value="">Select chapter</option>
                ${renderSelectOptions(getAssignmentChapterOptions(item.subject), item.chapter)}
              </select>
            </div>
            <div class="field full">
              <label for="modalAssignmentTitle">Assignment Title</label>
              <input id="modalAssignmentTitle" name="assignmentTitle" value="${escapeHtml(item.title)}">
            </div>
            <div class="field">
              <label for="modalAssignmentDeadline">Deadline</label>
              <input id="modalAssignmentDeadline" name="assignmentDeadline" type="date" value="${escapeHtml(item.deadline || "")}">
            </div>
            <div class="field">
              <label for="modalAssignmentQuestionLink">Question PDF Link</label>
              <input id="modalAssignmentQuestionLink" name="assignmentQuestionLink" value="${escapeHtml(item.questionLink || "")}">
            </div>
            <div class="field full">
              <label for="modalAssignmentSolutionLink">Solution PDF Link</label>
              <input id="modalAssignmentSolutionLink" name="assignmentSolutionLink" value="${escapeHtml(item.solutionLink || "")}">
            </div>
            <div class="field full">
              <button class="btn primary" type="submit">Update Assignment</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === "upload") {
    const noticeType = item.noticeTitle.replace(`${item.subject} `, "");
    return `
      <div class="modal-backdrop" onclick="closeAdminModal(event)">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="section-head">
            <div>
              <h2>Edit Upload</h2>
              <p>Update upload content, notice type, and PDF link.</p>
            </div>
            <button class="btn ghost" type="button" onclick="closeAdminModal()">Close</button>
          </div>
          <form id="modalUploadForm" class="form-grid">
            <div class="field">
              <label for="modalUploadSubject">Subject</label>
              <select id="modalUploadSubject" name="adminUploadSubject">
                <option value="">Select subject</option>
                ${renderSelectOptions(getSubjectOptions(), item.subject)}
              </select>
            </div>
            <div class="field">
              <label for="modalUploadStream">Type</label>
              <select id="modalUploadStream" name="adminUploadStream">
                <option value="">Select type</option>
                ${renderSelectOptions(UPLOAD_STREAM_OPTIONS, item.stream)}
              </select>
            </div>
            <div class="field">
              <label for="modalUploadChapter">Chapter</label>
              <select id="modalUploadChapter" name="adminUploadChapter">
                <option value="">Select chapter</option>
                ${renderSelectOptions(getChapterOptions(item.subject, item.stream), item.chapter)}
              </select>
            </div>
            <div class="field">
              <label for="modalUploadTopic">Topic</label>
              <input id="modalUploadTopic" name="adminUploadTopic" value="${escapeHtml(item.topic)}">
            </div>
            <div class="field full">
              <label for="modalUploadNoticeTitle">Notice Type</label>
              <select id="modalUploadNoticeTitle" name="adminUploadNoticeTitle">
                <option value="">Select notice type</option>
                ${renderSelectOptions(noticeTitleOptions, noticeType)}
              </select>
            </div>
            <div class="field full">
              <label for="modalUploadPdfLink">PDF Link</label>
              <input id="modalUploadPdfLink" name="adminUploadPdfLink" value="${escapeHtml(item.pdfLink || "")}">
            </div>
            <div class="field full">
              <button class="btn primary" type="submit">Update Upload</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return "";
}

function renderModeTabs() {
  const tabs = [
    { key: "home", label: "Home", mobileLabel: "Home" },
    { key: "notes", label: "Notes", mobileLabel: "Notes" },
    { key: "assignments", label: "Assignments", mobileLabel: "Tasks" },
    { key: "pyq", label: "PYQ", mobileLabel: "PYQ" },
    { key: "uploader", label: "Uploader", mobileLabel: "Upload" },
    { key: "admin", label: "Admin", mobileLabel: "Admin" },
  ];

  return `
    <div class="top-toolbar">
      <section class="mode-switch desktop-nav" style="grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr));">
        ${tabs
          .map(
            (tab) => `
              <button class="mode-tab ${appState.currentMode === tab.key ? "active" : ""}" onclick="setMode('${tab.key}')">
                ${tab.label}
              </button>
            `
          )
          .join("")}
      </section>
      <div class="toolbar-side">
        <div class="toolbar-brand" aria-label="${escapeHtml(BRAND.fullName)}">
          <strong>${escapeHtml(BRAND.name)}</strong>
          <span>${escapeHtml(BRAND.fullName)}</span>
        </div>
        <button
          class="theme-switch"
          type="button"
          onclick="toggleTheme()"
          aria-label="Toggle theme"
          aria-pressed="${appState.theme === "dark" ? "true" : "false"}"
          title="${appState.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}"
        >
          <span class="theme-switch-label">Theme</span>
          <span class="theme-switch-track ${appState.theme === "dark" ? "dark" : "light"}">
            <span class="theme-switch-thumb"></span>
          </span>
        </button>
      </div>
    </div>
    <nav class="mobile-bottom-nav" aria-label="Mobile navigation" style="grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr));">
      ${tabs
        .map(
          (tab) => `
            <button class="mobile-nav-btn ${appState.currentMode === tab.key ? "active" : ""}" onclick="setMode('${tab.key}')">
              <span class="mobile-nav-dot"></span>
              <span>${tab.mobileLabel}</span>
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderSelectOptions(options, selectedValue = "") {
  return options
    .map(
      (option) => `<option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(option)}</option>`
    )
    .join("");
}

function renderAssignments() {
  return `
    <section class="card section-card section-card-warm">
      <div class="section-head">
        <div>
          <span class="section-kicker">Deadlines</span>
          <h2>Assignments And Deadlines</h2>
          <p>Keep today’s work visible first, with chapter names, due dates, and quick PDF access.</p>
        </div>
        <span class="badge">${appState.assignments.length} Active</span>
      </div>
      <div class="stack">
        ${appState.assignments
          .map(
            (assignment) => `
              <article class="assignment-card">
                <div class="row">
                  <span class="tag">${escapeHtml(assignment.subject)}</span>
                  <span class="deadline">Deadline: ${escapeHtml(assignment.deadlineLabel || assignment.deadline)}</span>
                </div>
                <div>
                  <h3>${escapeHtml(assignment.title)}</h3>
                  <p class="notice-meta">${escapeHtml(assignment.chapter)}</p>
                </div>
                <div class="action-row">
                  <button class="btn primary" onclick="openExternalLink('${escapeHtml(assignment.questionLink || "#")}')">Open Assignment</button>
                  <button class="btn secondary" onclick="openExternalLink('${escapeHtml(assignment.questionLink || "#")}')">Question PDF</button>
                  <button class="btn secondary" onclick="openExternalLink('${escapeHtml(assignment.solutionLink || "#")}')">Solution PDF</button>
                </div>
                <div class="card-foot">Quick access for homework, tests, and revision sheets.</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHomeAssignmentsPreview() {
  const previewItems = appState.assignments.slice(0, 2);

  return `
    <section class="card section-card section-card-warm compact-section">
      <div class="section-head compact-head">
        <div>
          <span class="section-kicker">Tasks</span>
          <h2>Pending Work</h2>
        </div>
        <button class="btn ghost btn-mini" type="button" onclick="setMode('assignments')">View All</button>
      </div>
      <div class="stack compact-stack">
        ${previewItems
          .map(
            (assignment) => `
              <article class="assignment-card compact-item">
                <div class="row">
                  <span class="tag">${escapeHtml(assignment.subject)}</span>
                  <span class="deadline">${escapeHtml(assignment.deadlineLabel || assignment.deadline)}</span>
                </div>
                <div>
                  <h3>${escapeHtml(assignment.title)}</h3>
                  <p class="notice-meta">${escapeHtml(assignment.chapter)}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderNotices() {
  const notices = getGeneratedNotices();

  return `
    <section class="card section-card section-card-cool">
      <div class="section-head">
        <div>
          <span class="section-kicker">Updates</span>
          <h2>Notice Board</h2>
          <p>Fresh uploads automatically appear here, so everyone can catch updates without searching.</p>
        </div>
        <span class="badge">${notices.length} Notices</span>
      </div>
      <div class="stack">
        ${notices
          .map(
            (notice) => `
              <article class="notice-item">
                <strong>${escapeHtml(notice.title)}</strong>
                <span class="notice-meta">${escapeHtml(notice.topic)} - ${escapeHtml(notice.chapter)}</span>
                <span class="notice-meta">${escapeHtml(notice.subject)}</span>
                <span class="notice-meta">${escapeHtml(notice.message)} - ${escapeHtml(notice.date)}</span>
                ${
                  notice.pdfLink
                    ? `<div class="action-row"><button class="btn secondary" onclick="openExternalLink('${escapeHtml(notice.pdfLink)}')">Open PDF</button></div>`
                    : ""
                }
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHomeNoticesPreview() {
  const notices = getGeneratedNotices().slice(0, 2);

  return `
    <section class="card section-card section-card-cool compact-section">
      <div class="section-head compact-head">
        <div>
          <span class="section-kicker">Today</span>
          <h2>Latest Notices</h2>
        </div>
        <button class="btn ghost btn-mini" type="button" onclick="setMode('search')">Open Search</button>
      </div>
      <div class="stack compact-stack">
        ${notices
          .map(
            (notice) => `
              <article class="notice-item compact-item">
                <strong>${escapeHtml(notice.title)}</strong>
                <span class="notice-meta">${escapeHtml(notice.topic)}</span>
                <span class="notice-meta">${escapeHtml(notice.date)}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSubjects() {
  return `
    <section class="card section-card">
      <div class="section-head">
        <div>
          <span class="section-kicker">Start Here</span>
          <h2>Choose What You Need</h2>
          <p>Open notes, track assignments, or jump straight to previous year questions.</p>
        </div>
        <span class="badge">3 Main Paths</span>
      </div>
      <div class="grid three home-path-grid">
        <button class="nav-card" onclick="setMode('notes')">
          <div class="nav-icon">N</div>
          <h3>Notes</h3>
          <p>Browse subjects first, then open Theory or Practical notes chapter by chapter.</p>
          <div class="card-arrow">Open Notes</div>
        </button>
        <button class="nav-card" onclick="setMode('assignments')">
          <div class="nav-icon">A</div>
          <h3>Assignments</h3>
          <p>Keep deadlines, question PDFs, and solution PDFs easy to reach from one place.</p>
          <div class="card-arrow">Open Assignments</div>
        </button>
        <button class="nav-card" onclick="setMode('pyq')">
          <div class="nav-icon">P</div>
          <h3>PYQ</h3>
          <p>Open any subject and view previous year question files directly without extra folders.</p>
          <div class="card-arrow">Open PYQ</div>
        </button>
      </div>
    </section>
  `;
}

function renderOverviewPanel() {
  const todayLabel = formatDateLabel(new Date().toISOString());
  const stats = [
    {
      label: "Pending Assignments",
      value: getPendingAssignmentsCount(),
      note: "Due today or later",
      tone: "assignment",
    },
    {
      label: "Today's Notices",
      value: getTodaysNoticesCount(),
      note: `Uploaded on ${todayLabel}`,
      tone: "notice",
    },
  ];

  return `
    <section class="overview-panel overview-panel-minimal">
      <div class="kpi-grid kpi-grid-focus">
        ${stats
          .map(
            (stat) => `
              <article class="kpi-card kpi-card-${stat.tone}">
                <span class="kpi-value">${escapeHtml(stat.value)}</span>
                <span class="kpi-label">${escapeHtml(stat.label)}</span>
                <span class="kpi-note">${escapeHtml(stat.note)}</span>
                <span class="kpi-glow"></span>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDashboard() {
  return `
    <section class="page">
      ${renderModeTabs()}
      ${renderOverviewPanel()}
      <div class="grid two home-focus-grid">
        ${renderHomeAssignmentsPreview()}
        ${renderHomeNoticesPreview()}
      </div>
      ${renderSubjects()}
    </section>
  `;
}

function renderNotesPage() {
  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card section-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Notes</span>
            <h2>Subject Library</h2>
            <p>Choose a subject, then open Theory or Practical notes chapter by chapter.</p>
          </div>
          <span class="badge">${appState.subjects.length} Subjects</span>
        </div>
        <div class="grid four compact-subject-grid">
          ${appState.subjects
            .map((subject, index) => {
              return `
                <button class="subject-card tone-${(index % 5) + 1}" onclick="navigate({ page: 'subject', subject: '${subject.name}' })">
                  <div class="subject-icon">${escapeHtml(subject.accent)}</div>
                  <h3>${escapeHtml(subject.name)}</h3>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderAssignmentsPage() {
  return `
    <section class="page">
      ${renderModeTabs()}
      ${renderAssignments()}
    </section>
  `;
}

function getSubjectOptions() {
  return appState.subjects.map((subject) => subject.name);
}

function getChapterOptions(subjectName = "", streamName = "") {
  if (isPyqStream(streamName)) {
    return [];
  }

  return appState.chapters
    .filter((chapter) => (!subjectName || chapter.subject === subjectName) && (!streamName || chapter.stream === streamName))
    .sort((a, b) => a.chapterOrder - b.chapterOrder)
    .map((chapter) => chapter.chapterName);
}

function getAssignmentChapterOptions(subjectName = "") {
  return [...new Set(
    appState.chapters
      .filter((chapter) => !subjectName || chapter.subject === subjectName)
      .sort((a, b) => a.chapterOrder - b.chapterOrder)
      .map((chapter) => chapter.chapterName)
  )];
}

function renderUploadPage() {
  const recentUploads = [...appState.uploads];
  const subjectOptions = getSubjectOptions();
  const defaultSubject = subjectOptions[0] || "";
  const defaultStream = "Theory";
  const chapterOptions = getChapterOptions(defaultSubject, defaultStream);
  const assignmentChapterOptions = getAssignmentChapterOptions(defaultSubject);

  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card section-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">How To Upload</span>
            <h2>Uploader Instructions</h2>
            <p>First add the PDF inside your Drive folder, then paste the file share link into the upload form below.</p>
          </div>
          <div class="action-row">
            ${
              config.driveFolderLink
                ? `<button class="btn secondary" type="button" onclick="openExternalLink('${escapeHtml(config.driveFolderLink)}')">Open Drive Folder</button>`
                : ""
            }
            <button class="btn ghost" type="button" onclick="logoutAdmin()">Logout</button>
          </div>
        </div>
        <div class="stack">
          <article class="notice-item">
            <strong>Step 1</strong>
            <span class="notice-meta">Open your Drive folder and upload the file there.</span>
          </article>
          <article class="notice-item">
            <strong>Step 2</strong>
            <span class="notice-meta">Copy the file share link from Google Drive.</span>
          </article>
          <article class="notice-item">
            <strong>Step 3</strong>
            <span class="notice-meta">Paste that share link into the PDF link field in the uploader form.</span>
          </article>
        </div>
      </section>
      <section class="grid two">
        <section class="card upload-panel">
          <div class="section-head">
            <div>
              <span class="section-kicker">Study Material</span>
              <h2>Study Material Upload</h2>
              <p>Add subject content here. Notice board and chapter cards update automatically from this data.</p>
            </div>
          <span class="badge">${appState.backend.supabaseReady ? "Appwrite Live" : "Local Mode"}</span>
          </div>
          ${renderMessage()}
          <p class="status-note">Only topic name stays manual. For PYQ uploads, the app skips chapter folders automatically and keeps files at subject level.</p>
          ${
            config.driveFolderLink
              ? `<div class="action-row"><button class="btn secondary" type="button" onclick="openExternalLink('${escapeHtml(config.driveFolderLink)}')">Open Drive Folder</button></div>`
              : ""
          }
          <form id="uploadForm">
            <div class="form-grid">
              <div class="field">
                <label for="subject">Subject</label>
                <select id="subject" name="subject">
                  <option value="">Select subject</option>
                  ${renderSelectOptions(subjectOptions)}
                </select>
              </div>
              <div class="field">
                <label for="stream">Type</label>
                <select id="stream" name="stream">
                  <option value="">Select type</option>
                  ${renderSelectOptions(UPLOAD_STREAM_OPTIONS)}
                </select>
              </div>
              <div class="field">
                <label for="chapter">Chapter</label>
                <select id="chapter" name="chapter">
                  <option value="">Select chapter</option>
                  ${renderSelectOptions(chapterOptions)}
                </select>
              </div>
              <div class="field">
                <label for="topic">Topic</label>
                <input id="topic" name="topic" placeholder="Matrices introduction">
              </div>
              <div class="field full">
                <label for="noticeTitle">Notice Title</label>
                <select id="noticeTitle" name="noticeTitle">
                  <option value="">Select notice type</option>
                  ${renderSelectOptions(noticeTitleOptions)}
                </select>
              </div>
              <div class="field full">
                <label for="pdfLink">PDF Link</label>
                <input id="pdfLink" name="pdfLink" placeholder="${escapeHtml(config.driveFolderLink || "https://drive.google.com/... or any pdf link")}">
              </div>
            </div>
            <div class="action-row" style="margin-top: 14px;">
              <button class="btn primary" type="submit" ${appState.isSubmittingUpload ? "disabled" : ""}>
                ${appState.isSubmittingUpload ? "Saving..." : "Add Upload Data"}
              </button>
            </div>
          </form>
        </section>
        <section class="card upload-panel">
          <div class="section-head">
            <div>
              <span class="section-kicker">Assignments</span>
              <h2>Assignment Upload</h2>
              <p>Upload assignment details with separate question and solution PDF links.</p>
            </div>
            <span class="badge">Uploader Access</span>
          </div>
          <form id="uploaderAssignmentForm">
            <div class="form-grid">
              <div class="field">
                <label for="uploaderAssignmentSubject">Subject</label>
                <select id="uploaderAssignmentSubject" name="uploaderAssignmentSubject">
                  <option value="">Select subject</option>
                  ${renderSelectOptions(subjectOptions)}
                </select>
              </div>
              <div class="field">
                <label for="uploaderAssignmentChapter">Chapter</label>
                <select id="uploaderAssignmentChapter" name="uploaderAssignmentChapter">
                  <option value="">Select chapter</option>
                  ${renderSelectOptions(assignmentChapterOptions)}
                </select>
              </div>
              <div class="field full">
                <label for="uploaderAssignmentTitle">Assignment Title</label>
                <input id="uploaderAssignmentTitle" name="uploaderAssignmentTitle" placeholder="Chapter test or worksheet name">
              </div>
              <div class="field">
                <label for="uploaderAssignmentDeadline">Deadline</label>
                <input id="uploaderAssignmentDeadline" name="uploaderAssignmentDeadline" type="date">
              </div>
              <div class="field">
                <label for="uploaderAssignmentQuestionLink">Question PDF Link</label>
                <input id="uploaderAssignmentQuestionLink" name="uploaderAssignmentQuestionLink" placeholder="https://...question.pdf">
              </div>
              <div class="field full">
                <label for="uploaderAssignmentSolutionLink">Solution PDF Link</label>
                <input id="uploaderAssignmentSolutionLink" name="uploaderAssignmentSolutionLink" placeholder="https://...solution.pdf">
              </div>
            </div>
            <div class="action-row" style="margin-top: 14px;">
              <button class="btn primary" type="submit">Save Assignment</button>
            </div>
          </form>
        </section>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Recent Activity</span>
            <h2>Recent Upload Feed</h2>
            <p>These uploads are the source of notices, chapters, and daily topic entries.</p>
          </div>
          <span class="badge">${recentUploads.length} Uploaded</span>
        </div>
        <div class="stack">
          ${recentUploads
            .map(
              (upload) => `
                <article class="upload-item">
                  <strong>${escapeHtml(upload.noticeTitle)}</strong>
                  <div class="upload-meta">${escapeHtml(formatUploadLocation(upload))}</div>
                  <div class="upload-meta">${escapeHtml(upload.topic)} - ${escapeHtml(upload.date)}</div>
                  ${
                    upload.pdfLink
                      ? `<div class="action-row" style="margin-top: 12px;"><button class="btn secondary" onclick="openExternalLink('${escapeHtml(upload.pdfLink)}')">Open PDF</button></div>`
                      : ""
                  }
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderUploaderBlockedPage() {
  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card admin-login-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Protected Access</span>
            <h2>Uploader Login</h2>
            <p>Login here with an approved uploader or admin account to open the uploader page.</p>
          </div>
          <span class="badge">Uploader Access</span>
        </div>
        ${renderMessage()}
        <form id="uploaderLoginForm" class="form-grid">
          <div class="field">
            <label for="uploaderEmail">Email</label>
            <input id="uploaderEmail" name="uploaderEmail" type="email" placeholder="uploader@example.com">
          </div>
          <div class="field">
            <label for="uploaderPassword">Password</label>
            <input id="uploaderPassword" name="uploaderPassword" type="password" placeholder="Enter your password">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Login as Uploader</button>
          </div>
        </form>
          <p class="status-note">Use an Appwrite Auth user whose ID is either the admin user ID or listed in <code>uploaderUserIds</code>.</p>
      </section>
    </section>
  `;
}

function renderSearchResults(items) {
  return items
    .map(
      (upload) => `
        <article class="topic-item">
          <strong>${escapeHtml(upload.topic)}</strong>
          <div class="topic-meta">${escapeHtml(formatUploadLocation(upload))}</div>
          <div class="topic-meta">${escapeHtml(upload.noticeTitle)} - ${escapeHtml(upload.date)}</div>
          ${
            upload.pdfLink
              ? `<div class="action-row" style="margin-top: 12px;"><button class="btn secondary" onclick="openExternalLink('${escapeHtml(upload.pdfLink)}')">Open PDF</button></div>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function renderSearchPage() {
  const items = getFilteredUploads();
  const subjectOptions = getSubjectOptions();
  const chapterOptions = getChapterOptions(appState.filters.subject, appState.filters.stream);

  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Finder</span>
            <h2>Search Section</h2>
            <p>Find uploads quickly using filters instead of typing.</p>
          </div>
          <span class="badge" id="searchCount">${items.length} Results</span>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="filterSubject">Subject</label>
            <select id="filterSubject" name="filterSubject">
              <option value="">All subjects</option>
              ${renderSelectOptions(subjectOptions, appState.filters.subject)}
            </select>
          </div>
          <div class="field">
            <label for="filterStream">Type</label>
            <select id="filterStream" name="filterStream">
              <option value="">All types</option>
              ${renderSelectOptions(UPLOAD_STREAM_OPTIONS, appState.filters.stream)}
            </select>
          </div>
          <div class="field">
            <label for="filterChapter">Chapter</label>
            <select id="filterChapter" name="filterChapter">
              <option value="">All chapters</option>
              ${renderSelectOptions(chapterOptions, appState.filters.chapter)}
            </select>
          </div>
          <div class="field search-actions">
            <label>&nbsp;</label>
            <button class="btn secondary" type="button" onclick="resetSearchFilters()">Clear Filters</button>
          </div>
        </div>
        <div id="searchResults" class="stack" style="margin-top: 16px;">
          ${renderSearchResults(items)}
        </div>
      </section>
    </section>
  `;
}

function renderSubjectPage(subjectName) {
  const streams = getSubjectStreams(subjectName);

  return `
    <section class="page">
      ${renderModeTabs()}
      <div class="page-header">
        <button class="back-btn" onclick="setMode('notes')">Back</button>
        <div>
          <h2>${escapeHtml(subjectName)}</h2>
          <div class="crumbs">Notes / ${escapeHtml(subjectName)}</div>
        </div>
      </div>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(subjectName)} Sections</h2>
            <p>Each subject opens into two cards: Theory and Practical.</p>
          </div>
        </div>
        <div class="grid two">
          ${streams
            .map(
              (stream) => `
                <button class="nav-card" onclick="navigate({ page: 'stream', subject: '${subjectName}', stream: '${stream.name}' })">
                  <div class="nav-icon">${stream.name === "Theory" ? "T" : "P"}</div>
                  <h3>${escapeHtml(stream.name)}</h3>
                  <p>${escapeHtml(stream.description)}</p>
                  <p class="notice-meta" style="margin-top: 12px;">${stream.count} configured chapters</p>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderStreamPage(subjectName, streamName) {
  const chapters = getChapters(subjectName, streamName);

  return `
    <section class="page">
      ${renderModeTabs()}
      <div class="page-header">
        <button class="back-btn" onclick="navigate({ page: 'subject', subject: '${subjectName}' })">Back</button>
        <div>
          <h2>${escapeHtml(streamName)} Chapters</h2>
          <div class="crumbs">Notes / ${escapeHtml(subjectName)} / ${escapeHtml(streamName)}</div>
        </div>
      </div>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Chapter Cards</h2>
            <p>These chapters are now controlled from the admin panel.</p>
          </div>
          <span class="badge">${chapters.length} Chapters</span>
        </div>
        ${
          chapters.length
            ? `<div class="grid two">
                ${chapters
                  .map(
                    (chapter) => `
                      <button class="chapter-card" onclick="navigate({ page: 'chapter', subject: '${subjectName}', stream: '${streamName}', chapter: '${chapter.name}' })">
                        <div class="chapter-icon">${escapeHtml(chapter.name.replace("Chapter ", "C"))}</div>
                        <h3>${escapeHtml(chapter.name)}</h3>
                        <p>${chapter.topics} topic uploads inside this chapter.</p>
                        <p class="notice-meta" style="margin-top: 12px;">${chapter.latestDate ? `Last upload: ${escapeHtml(chapter.latestDate)}` : "No uploads yet"}</p>
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state"><h3>No chapters yet</h3><p>Open Admin and add chapters for this subject and stream.</p></div>`
        }
      </section>
    </section>
  `;
}

function renderChapterPage(subjectName, streamName, chapterName) {
  const topics = getTopics(subjectName, streamName, chapterName);

  return `
    <section class="page">
      ${renderModeTabs()}
      <div class="page-header">
        <button class="back-btn" onclick="navigate({ page: 'stream', subject: '${subjectName}', stream: '${streamName}' })">Back</button>
        <div>
          <h2>${escapeHtml(chapterName)} Topic List</h2>
          <div class="crumbs">Notes / ${escapeHtml(subjectName)} / ${escapeHtml(streamName)} / ${escapeHtml(chapterName)}</div>
        </div>
      </div>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Daily Uploaded Topics</h2>
            <p>Each topic appears with date and topic name inside its chapter directory.</p>
          </div>
          <span class="badge">${topics.length} Topics</span>
        </div>
        <div class="stack">
          ${topics
            .map(
              (topic) => `
                <article class="topic-item">
                  <strong>${escapeHtml(topic.topic)}</strong>
                  <div class="topic-meta">${escapeHtml(topic.subject)} - ${escapeHtml(topic.stream)}</div>
                  <div class="topic-meta">${escapeHtml(topic.date)} - ${escapeHtml(topic.noticeTitle)}</div>
                  ${
                    topic.pdfLink
                      ? `<div class="action-row" style="margin-top: 12px;"><button class="btn secondary" onclick="openExternalLink('${escapeHtml(topic.pdfLink)}')">Open Topic PDF</button></div>`
                      : ""
                  }
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderPyqPage() {
  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card section-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">PYQ</span>
            <h2>Subject-Wise Previous Year Questions</h2>
            <p>Choose a subject to open its previous year question files directly.</p>
          </div>
          <span class="badge">${appState.subjects.length} Subjects</span>
        </div>
        <div class="grid four compact-subject-grid">
          ${appState.subjects
            .map((subject, index) => {
              return `
                <button class="subject-card tone-${(index % 5) + 1}" onclick="navigate({ page: 'pyq-subject', subject: '${subject.name}' })">
                  <div class="subject-icon">${escapeHtml(subject.accent)}</div>
                  <h3>${escapeHtml(subject.name)}</h3>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderPyqSubjectPage(subjectName) {
  const pyqUploads = getPyqUploads(subjectName);

  return `
    <section class="page">
      ${renderModeTabs()}
      <div class="page-header">
        <button class="back-btn" onclick="setMode('pyq')">Back</button>
        <div>
          <h2>${escapeHtml(subjectName)} PYQ</h2>
          <div class="crumbs">PYQ / ${escapeHtml(subjectName)}</div>
        </div>
      </div>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Previous Year Questions</h2>
            <p>All PYQ files stay directly under the subject, without extra chapter directories.</p>
          </div>
          <span class="badge">${pyqUploads.length} Files</span>
        </div>
        ${
          pyqUploads.length
            ? `<div class="stack">
                ${pyqUploads
                  .map(
                    (upload) => `
                      <article class="topic-item">
                        <strong>${escapeHtml(upload.topic)}</strong>
                        <div class="topic-meta">${escapeHtml(upload.subject)} - PYQ</div>
                        <div class="topic-meta">${escapeHtml(upload.date)} - ${escapeHtml(upload.noticeTitle)}</div>
                        ${
                          upload.pdfLink
                            ? `<div class="action-row" style="margin-top: 12px;"><button class="btn secondary" onclick="openExternalLink('${escapeHtml(upload.pdfLink)}')">Open PYQ PDF</button></div>`
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state"><h3>No PYQ uploads yet</h3><p>Add PYQ files from the uploader or admin upload section to show them here.</p></div>`
        }
      </section>
    </section>
  `;
}

function renderAdminLogin() {
  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card admin-login-card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Protected Access</span>
            <h2>Admin Login</h2>
            <p>Login here to manage subjects, chapters, assignments, uploads, and website text.</p>
          </div>
          <span class="badge">Control Panel</span>
        </div>
        ${renderMessage()}
        <form id="adminLoginForm" class="form-grid">
          <div class="field">
            <label for="adminUsername">Username</label>
            <input id="adminUsername" name="adminUsername" type="email" placeholder="admin@example.com">
          </div>
          <div class="field">
            <label for="adminPassword">Password</label>
            <input id="adminPassword" name="adminPassword" type="password" placeholder="Enter your password">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Login with Appwrite Auth</button>
          </div>
        </form>
          <p class="status-note">Use the Appwrite Auth user whose ID matches <code>adminUserId</code> for admin, or add uploader IDs in <code>uploaderUserIds</code> for upload-only access.</p>
      </section>
    </section>
  `;
}

function renderAdminNav() {
  const sections = [
    { key: "subjects", label: "Subjects" },
    { key: "chapters", label: "Chapters" },
    { key: "assignments", label: "Assignments" },
    { key: "uploads", label: "Uploads" },
    { key: "settings", label: "Website" },
  ];

  return `
    <div class="admin-nav">
      ${sections
        .map(
          (section) => `
            <button class="mode-tab ${appState.admin.section === section.key ? "active" : ""}" onclick="setAdminSection('${section.key}')">
              ${section.label}
            </button>
          `
        )
        .join("")}
      <button class="mode-tab" onclick="logoutAdmin()">Logout</button>
    </div>
  `;
}

function renderAdminSubjects() {
  return `
    <section class="grid two">
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Manage Subjects</h2>
            <p>Add subject name, accent, and description from here.</p>
          </div>
        </div>
        <form id="adminSubjectForm" class="form-grid">
          <div class="field">
            <label for="subjectName">Subject Name</label>
            <input id="subjectName" name="subjectName" placeholder="Mathematics Part 1">
          </div>
          <div class="field">
            <label for="subjectAccent">Accent</label>
            <input id="subjectAccent" name="subjectAccent" placeholder="M1">
          </div>
          <div class="field full">
            <label for="subjectDescription">Description</label>
            <input id="subjectDescription" name="subjectDescription" placeholder="Core concepts, formulas, and solved examples.">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Save Subject</button>
          </div>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Current Subjects</h2>
            <p>These drive your dashboard subject cards and upload dropdown.</p>
          </div>
        </div>
        <div class="stack">
          ${appState.subjects
            .map(
              (subject) => `
                <article class="notice-item">
                  <strong>${escapeHtml(subject.name)}</strong>
                  <span class="notice-meta">${escapeHtml(subject.accent)} - ${escapeHtml(subject.description)}</span>
                  <div class="inline-actions">
                    <button class="btn ghost" onclick="startEditSubject(${subject.id})">Edit</button>
                    <button class="btn danger" onclick="deleteSubject(${subject.id})">Delete</button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderAdminChapters() {
  return `
    <section class="grid two">
      <section class="card">
        <div class="section-head">
            <div>
              <h2>Manage Chapters</h2>
              <p>Control how many chapters each subject has in Theory or Practical. PYQ stays subject-level and does not need chapters.</p>
            </div>
        </div>
        <form id="adminChapterForm" class="form-grid">
          <div class="field">
            <label for="chapterSubject">Subject</label>
            <select id="chapterSubject" name="chapterSubject">
              <option value="">Select subject</option>
              ${renderSelectOptions(getSubjectOptions())}
            </select>
          </div>
          <div class="field">
            <label for="chapterStream">Type</label>
            <select id="chapterStream" name="chapterStream">
              <option value="">Select type</option>
              ${renderSelectOptions(NOTE_STREAM_OPTIONS)}
            </select>
          </div>
          <div class="field">
            <label for="chapterName">Chapter Name</label>
            <input id="chapterName" name="chapterName" placeholder="Chapter 3">
          </div>
          <div class="field">
            <label for="chapterOrder">Chapter Order</label>
            <input id="chapterOrder" name="chapterOrder" type="number" min="1" placeholder="3">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Save Chapter</button>
          </div>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Current Chapters</h2>
            <p>These control the chapter cards visible on subject pages.</p>
          </div>
        </div>
        <div class="stack">
          ${appState.chapters
            .slice()
            .sort((a, b) => a.subject.localeCompare(b.subject) || a.stream.localeCompare(b.stream) || a.chapterOrder - b.chapterOrder)
            .map(
              (chapter) => `
                <article class="notice-item">
                  <strong>${escapeHtml(chapter.chapterName)}</strong>
                  <span class="notice-meta">${escapeHtml(chapter.subject)} - ${escapeHtml(chapter.stream)} - Order ${escapeHtml(chapter.chapterOrder)}</span>
                  <div class="inline-actions">
                    <button class="btn ghost" onclick="startEditChapter(${chapter.id})">Edit</button>
                    <button class="btn danger" onclick="deleteChapter(${chapter.id})">Delete</button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderAdminAssignments() {
  const assignmentChapterOptions = [];
  return `
    <section class="grid two">
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Manage Assignments</h2>
            <p>Add assignment title, deadline, question PDF, and solution PDF separately.</p>
          </div>
        </div>
        <form id="adminAssignmentForm" class="form-grid">
          <div class="field">
            <label for="assignmentSubject">Subject</label>
            <select id="assignmentSubject" name="assignmentSubject">
              <option value="">Select subject</option>
              ${renderSelectOptions(getSubjectOptions())}
            </select>
          </div>
          <div class="field">
            <label for="assignmentChapter">Chapter</label>
            <select id="assignmentChapter" name="assignmentChapter">
              <option value="">Select chapter</option>
              ${renderSelectOptions(assignmentChapterOptions)}
            </select>
          </div>
          <div class="field full">
            <label for="assignmentTitle">Assignment Title</label>
            <input id="assignmentTitle" name="assignmentTitle" placeholder="Laws of Motion Practice">
          </div>
          <div class="field">
            <label for="assignmentDeadline">Deadline</label>
            <input id="assignmentDeadline" name="assignmentDeadline" type="date">
          </div>
          <div class="field">
            <label for="assignmentQuestionLink">Question PDF Link</label>
            <input id="assignmentQuestionLink" name="assignmentQuestionLink" placeholder="https://...question.pdf">
          </div>
          <div class="field full">
            <label for="assignmentSolutionLink">Solution PDF Link</label>
            <input id="assignmentSolutionLink" name="assignmentSolutionLink" placeholder="https://...solution.pdf">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Save Assignment</button>
          </div>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Current Assignments</h2>
            <p>These cards appear in the public dashboard.</p>
          </div>
        </div>
        <div class="stack">
          ${appState.assignments
            .map(
              (assignment) => `
                <article class="notice-item">
                  <strong>${escapeHtml(assignment.title)}</strong>
                  <span class="notice-meta">${escapeHtml(assignment.subject)} - ${escapeHtml(assignment.chapter)}</span>
                  <span class="notice-meta">Deadline: ${escapeHtml(assignment.deadlineLabel || assignment.deadline)}</span>
                  <div class="inline-actions">
                    <button class="btn ghost" onclick="startEditAssignment(${assignment.id})">Edit</button>
                    <button class="btn danger" onclick="deleteAssignment(${assignment.id})">Delete</button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderAdminUploads() {
  const adminUploadChapterOptions = [];
  return `
    <section class="grid two">
      <section class="card">
        <div class="section-head">
            <div>
              <h2>Manage Uploads</h2>
              <p>Upload notes or PYQ here. PYQ stays directly under the subject without a chapter directory.</p>
            </div>
        </div>
        ${
          config.driveFolderLink
            ? `<div class="action-row" style="margin-bottom: 12px;"><button class="btn secondary" type="button" onclick="openExternalLink('${escapeHtml(config.driveFolderLink)}')">Open Drive Folder</button></div>`
            : ""
        }
        <form id="adminUploadForm" class="form-grid">
          <div class="field">
            <label for="adminUploadSubject">Subject</label>
            <select id="adminUploadSubject" name="adminUploadSubject">
              <option value="">Select subject</option>
              ${renderSelectOptions(getSubjectOptions())}
            </select>
          </div>
          <div class="field">
            <label for="adminUploadStream">Type</label>
            <select id="adminUploadStream" name="adminUploadStream">
              <option value="">Select type</option>
              ${renderSelectOptions(UPLOAD_STREAM_OPTIONS)}
            </select>
          </div>
          <div class="field">
            <label for="adminUploadChapter">Chapter</label>
            <select id="adminUploadChapter" name="adminUploadChapter">
              <option value="">Select chapter</option>
              ${renderSelectOptions(adminUploadChapterOptions)}
            </select>
          </div>
          <div class="field">
            <label for="adminUploadTopic">Topic</label>
            <input id="adminUploadTopic" name="adminUploadTopic" placeholder="Matrices introduction">
          </div>
          <div class="field full">
            <label for="adminUploadNoticeTitle">Notice Type</label>
            <select id="adminUploadNoticeTitle" name="adminUploadNoticeTitle">
              <option value="">Select notice type</option>
              ${renderSelectOptions(noticeTitleOptions)}
            </select>
          </div>
          <div class="field full">
            <label for="adminUploadPdfLink">PDF Link</label>
            <input id="adminUploadPdfLink" name="adminUploadPdfLink" placeholder="${escapeHtml(config.driveFolderLink || "https://drive.google.com/... or any pdf link")}">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Save Upload</button>
          </div>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Current Uploads</h2>
            <p>These records generate your notice board and chapter topic pages automatically.</p>
          </div>
        </div>
        <div class="stack">
          ${appState.uploads
            .map(
              (upload) => `
                <article class="notice-item">
                  <strong>${escapeHtml(upload.noticeTitle)}</strong>
                  <span class="notice-meta">${escapeHtml(formatUploadLocation(upload))}</span>
                  <span class="notice-meta">${escapeHtml(upload.topic)} - ${escapeHtml(upload.date)}</span>
                  <div class="inline-actions">
                    <button class="btn ghost" onclick="startEditUpload(${upload.id})">Edit</button>
                    <button class="btn danger" onclick="deleteUpload(${upload.id})">Delete</button>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderAdminSettings() {
  return `
    <section class="grid two">
      <section class="card">
        <div class="section-head">
          <div>
            <h2>Website Customisation</h2>
            <p>Control general website text settings from here.</p>
          </div>
        </div>
        <form id="adminSettingsForm" class="form-grid">
          <div class="field full">
            <label for="heroEyebrow">Top Label</label>
            <input id="heroEyebrow" name="heroEyebrow" value="${escapeHtml(appState.settings.heroEyebrow)}">
          </div>
          <div class="field full">
            <label for="heroTitle">Main Title</label>
            <input id="heroTitle" name="heroTitle" value="${escapeHtml(appState.settings.heroTitle)}">
          </div>
          <div class="field full">
            <label for="heroCopy">Main Description</label>
            <input id="heroCopy" name="heroCopy" value="${escapeHtml(appState.settings.heroCopy)}">
          </div>
          <div class="field full">
            <button class="btn primary" type="submit">Save Website Settings</button>
          </div>
        </form>
      </section>
      <section class="card">
        <div class="section-head">
          <div>
            <h2>What You Control</h2>
            <p>This admin side is now your central place for website customisation.</p>
          </div>
        </div>
        <div class="stack">
          <article class="notice-item">
            <strong>Subjects</strong>
            <span class="notice-meta">Add and control subject cards.</span>
          </article>
          <article class="notice-item">
            <strong>Chapters</strong>
            <span class="notice-meta">Control how many chapters each subject has in Theory and Practical.</span>
          </article>
          <article class="notice-item">
            <strong>Assignments</strong>
            <span class="notice-meta">Add assignment title, deadline, question PDF, and solution PDF.</span>
          </article>
          <article class="notice-item">
            <strong>Uploads</strong>
            <span class="notice-meta">Control notices, topic timelines, and chapter topic content.</span>
          </article>
          <article class="notice-item">
            <strong>Website Text</strong>
            <span class="notice-meta">Change main title and general welcome text.</span>
          </article>
        </div>
      </section>
    </section>
  `;
}

function renderAdminPage() {
  if (!appState.admin.loggedIn) {
    return renderAdminLogin();
  }

  let sectionContent = "";

  if (appState.admin.section === "subjects") {
    sectionContent = renderAdminSubjects();
  } else if (appState.admin.section === "chapters") {
    sectionContent = renderAdminChapters();
  } else if (appState.admin.section === "assignments") {
    sectionContent = renderAdminAssignments();
  } else if (appState.admin.section === "uploads") {
    sectionContent = renderAdminUploads();
  } else {
    sectionContent = renderAdminSettings();
  }

  return `
    <section class="page">
      ${renderModeTabs()}
      <section class="card">
        <div class="section-head">
          <div>
            <span class="section-kicker">Control Room</span>
            <h2>Admin Control Panel</h2>
            <p>Manage everything from here: subjects, chapters, assignments, uploads, and website text.</p>
          </div>
          <div class="action-row">
            <span class="badge">Full Admin</span>
            <button class="btn ghost" type="button" onclick="logoutAdmin()">Logout</button>
          </div>
        </div>
        ${renderMessage()}
        ${renderAdminNav()}
      </section>
      ${sectionContent}
      ${renderAdminModal()}
    </section>
  `;
}

function render() {
  let content = "";

  if (appState.route.page === "upload") {
    content = appState.admin.canUpload ? renderUploadPage() : renderUploaderBlockedPage();
  } else if (appState.route.page === "uploader") {
    content = appState.admin.canUpload ? renderUploadPage() : renderUploaderBlockedPage();
  } else if (appState.route.page === "notes") {
    content = renderNotesPage();
  } else if (appState.route.page === "search") {
    content = renderSearchPage();
  } else if (appState.route.page === "assignments") {
    content = renderAssignmentsPage();
  } else if (appState.route.page === "pyq") {
    content = renderPyqPage();
  } else if (appState.route.page === "pyq-subject") {
    content = renderPyqSubjectPage(appState.route.subject);
  } else if (appState.route.page === "subject") {
    content = renderSubjectPage(appState.route.subject);
  } else if (appState.route.page === "stream") {
    content = renderStreamPage(appState.route.subject, appState.route.stream);
  } else if (appState.route.page === "chapter") {
    content = renderChapterPage(appState.route.subject, appState.route.stream, appState.route.chapter);
  } else if (appState.route.page === "admin") {
    content = renderAdminPage();
  } else {
    content = renderDashboard();
  }

  app.innerHTML = content;
  bindDynamicEvents();
}

function updateSearchResults() {
  const items = getFilteredUploads();
  const searchResults = document.getElementById("searchResults");
  const searchCount = document.getElementById("searchCount");

  if (searchResults) {
    searchResults.innerHTML = renderSearchResults(items);
  }

  if (searchCount) {
    searchCount.textContent = `${items.length} Results`;
  }
}

function refreshSearchChapterOptions() {
  const chapterSelect = document.getElementById("filterChapter");
  if (!chapterSelect) {
    return;
  }

  if (isPyqStream(appState.filters.stream)) {
    appState.filters.chapter = "";
    chapterSelect.disabled = true;
    chapterSelect.innerHTML = `<option value="">No chapter filter for PYQ</option>`;
    return;
  }

  chapterSelect.disabled = false;
  const options = getChapterOptions(appState.filters.subject, appState.filters.stream);
  const currentValue = options.includes(appState.filters.chapter) ? appState.filters.chapter : "";
  appState.filters.chapter = currentValue;
  chapterSelect.innerHTML = `<option value="">All chapters</option>${renderSelectOptions(options, currentValue)}`;
}

function cloneRoute(route) {
  return { ...route };
}

function getViewSnapshot() {
  return {
    route: cloneRoute(appState.route),
    adminSection: appState.admin.section,
  };
}

function getSnapshotKey(snapshot) {
  return JSON.stringify({
    route: snapshot.route,
    adminSection: snapshot.adminSection,
  });
}

function pushViewSnapshot() {
  const snapshot = getViewSnapshot();
  const lastSnapshot = appState.navigationHistory[appState.navigationHistory.length - 1];

  if (lastSnapshot && getSnapshotKey(lastSnapshot) === getSnapshotKey(snapshot)) {
    return;
  }

  appState.navigationHistory.push(snapshot);
}

function shouldTrackViewChange(nextRoute, nextAdminSection = appState.admin.section) {
  const currentSnapshot = getViewSnapshot();
  const nextSnapshot = {
    route: cloneRoute(nextRoute),
    adminSection: nextAdminSection,
  };

  return getSnapshotKey(currentSnapshot) !== getSnapshotKey(nextSnapshot);
}

function restoreViewSnapshot(snapshot) {
  appState.route = cloneRoute(snapshot.route);
  appState.admin.section = snapshot.adminSection || appState.admin.section;
  appState.currentMode = getModeForRoute(appState.route);
  appState.admin.modal = null;
  clearMessage();
  render();
}

function goBackInApp() {
  if (appState.admin.modal) {
    appState.admin.modal = null;
    render();
    return true;
  }

  const previousView = appState.navigationHistory.pop();
  if (previousView) {
    restoreViewSnapshot(previousView);
    return true;
  }

  if (appState.route.page !== "dashboard") {
    appState.route = { page: "dashboard" };
    appState.currentMode = "home";
    appState.admin.modal = null;
    clearMessage();
    render();
    return true;
  }

  return false;
}

function setMode(mode) {
  const route = { page: mode === "home" ? "dashboard" : mode };
  if (shouldTrackViewChange(route)) {
    pushViewSnapshot();
  }
  appState.route = route;
  appState.currentMode = getModeForRoute(route);
  appState.admin.modal = null;
  render();
}

function getModeForRoute(route) {
  if (route.page === "dashboard") {
    return "home";
  }

  if (["notes", "subject", "stream", "chapter", "search"].includes(route.page)) {
    return "notes";
  }

  if (["pyq", "pyq-subject"].includes(route.page)) {
    return "pyq";
  }

  return route.page;
}

function navigate(route) {
  if (shouldTrackViewChange(route)) {
    pushViewSnapshot();
  }
  appState.route = route;
  appState.currentMode = getModeForRoute(route);
  appState.admin.modal = null;
  render();
}

function setAdminSection(section) {
  if (shouldTrackViewChange(appState.route, section)) {
    pushViewSnapshot();
  }
  appState.admin.section = section;
  clearMessage();
  render();
}

function openExternalLink(url) {
  if (!url || url === "#") {
    setMessage("info", "This link is not connected yet.");
    render();
    return;
  }

  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      setMessage("error", "Only web links can be opened from the app.");
      render();
      return;
    }
  } catch (error) {
    setMessage("error", "This link is not valid.");
    render();
    return;
  }

  const browserPlugin = window.Capacitor?.Plugins?.Browser;
  if (browserPlugin?.open) {
    browserPlugin.open({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function ensureSubjectExists(subjectName) {
  if (appState.subjects.some((item) => item.name === subjectName)) {
    return;
  }

  appState.subjects.push({
    id: slugify(subjectName),
    name: subjectName,
    accent: subjectName
      .split(" ")
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 3)
      .toUpperCase(),
    description: "New subject added from admin data.",
  });
}

function getTableId(tableKey) {
  return config.appwriteTables?.[tableKey] || tableKey;
}

function getRowId(row) {
  return row?.$id || row?.id || "";
}

function mapAppwriteRows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function listTableRows(tableKey, queries = []) {
  const result = await tablesClient.listRows({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId(tableKey),
    queries: [QueryHelpers.limit(5000), ...queries],
    total: false,
  });

  return mapAppwriteRows(result);
}

async function initializeBackend() {
  if (!hasBackendConfig()) {
    appState.backend.lastError = "Missing Appwrite endpoint or project ID";
    return;
  }

  AppwriteSdk = window.Appwrite;
  QueryHelpers = AppwriteSdk.Query;
  IdHelpers = AppwriteSdk.ID;

  backendClient = new AppwriteSdk.Client()
    .setEndpoint(config.appwriteEndpoint)
    .setProject(config.appwriteProjectId);

  accountClient = new AppwriteSdk.Account(backendClient);
  if (typeof AppwriteSdk.TablesDB !== "function") {
    throw new Error("Loaded Appwrite SDK does not include TablesDB. Please refresh after updating the SDK script.");
  }
  tablesClient = new AppwriteSdk.TablesDB(backendClient);
  appState.backend.supabaseReady = true;
  appState.backend.lastError = "";
}

async function applyAdminSession(user) {
  const email = user?.email || "";
  const uid = user?.$id || "";
  appState.admin.userEmail = email;
  appState.admin.userId = uid;
  appState.admin.role = await fetchUserRole(uid);
  appState.admin.loggedIn = appState.admin.role === "admin";
  appState.admin.canUpload = appState.admin.role === "admin" || appState.admin.role === "uploader";

  if (uid && !appState.admin.loggedIn && !appState.admin.canUpload) {
    setMessage("error", "This Appwrite user is not allowed to access admin or uploader.");
  }

  if (!uid) {
    appState.admin.loggedIn = false;
    appState.admin.role = "guest";
    appState.admin.canUpload = false;
  }
}

async function initializeBackendAuth() {
  if (!accountClient) {
    return;
  }

  try {
    const user = await accountClient.get();
    await applyAdminSession(user);
  } catch (error) {
    await applyAdminSession(null);
  }
}

async function loadSubjectsFromBackend() {
  const rows = await listTableRows("subjects", [QueryHelpers.orderAsc("display_order")]);

  if (rows.length) {
    appState.subjects = rows.map((item) => ({
      id: item.$id,
      slug: item.slug,
      name: item.name,
      accent: item.accent,
      description: item.description,
    }));
  }
}

async function loadChaptersFromBackend() {
  const rows = await listTableRows("chapters", [QueryHelpers.orderAsc("chapter_order")]);

  if (rows.length) {
    appState.chapters = rows.map((item) => ({
      id: item.$id,
      subject: item.subject,
      stream: item.stream,
      chapterName: item.chapter_name,
      chapterOrder: item.chapter_order,
    }));
  }
}

async function loadAssignmentsFromBackend() {
  const rows = await listTableRows("assignments", [QueryHelpers.orderAsc("deadline")]);

  if (rows.length) {
    appState.assignments = rows.map((item) => ({
      id: item.$id,
      chapter: item.chapter || "",
      subject: item.subject,
      deadline: item.deadline || "",
      deadlineLabel: formatDateLabel(item.deadline),
      title: item.title,
      questionLink: item.question_link || "#",
      solutionLink: item.solution_link || "#",
    }));
  }
}

async function loadUploadsFromBackend() {
  const rows = await listTableRows("uploads", [QueryHelpers.orderDesc("uploaded_on")]);

  if (rows.length) {
    appState.uploads = rows.map((item) => ({
      id: item.$id,
      subject: item.subject,
      stream: item.stream,
      chapter: item.chapter,
      topic: item.topic,
      noticeTitle: item.notice_title,
      pdfLink: item.pdf_link || "",
      uploadedOn: item.uploaded_on || "",
      date: formatDateLabel(item.uploaded_on),
    }));
  }
}

async function loadSettingsFromBackend() {
  const rows = await listTableRows("siteSettings");

  if (rows.length) {
    const item = rows[0];
    appState.settings = {
      id: item.$id,
      heroEyebrow: item.hero_eyebrow,
      heroTitle: item.hero_title,
      heroCopy: item.hero_copy,
    };
  }
}

async function loadRemoteData() {
  if (!appState.backend.supabaseReady) {
    return;
  }

  await Promise.all([
    loadSubjectsFromBackend(),
    loadChaptersFromBackend(),
    loadAssignmentsFromBackend(),
    loadUploadsFromBackend(),
    loadSettingsFromBackend(),
  ]);

  appState.backend.usingFallbackData = false;
}

async function refreshRemoteDataSilently() {
  if (!appState.backend.supabaseReady || remoteRefreshInFlight) {
    return;
  }

  remoteRefreshInFlight = true;

  try {
    await loadRemoteData();
    render();
  } catch (error) {
    console.error(error);
  } finally {
    remoteRefreshInFlight = false;
  }
}

function startRemoteRefreshLoop() {
  if (remoteRefreshTimer || !appState.backend.supabaseReady) {
    return;
  }

  remoteRefreshTimer = window.setInterval(() => {
    refreshRemoteDataSilently();
  }, 60000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshRemoteDataSilently();
    }
  });

  window.addEventListener("focus", () => {
    refreshRemoteDataSilently();
  });
}

async function saveSubjectToSupabase(subject) {
  const payload = {
    slug: slugify(subject.name),
    name: subject.name,
    accent: subject.accent,
    description: subject.description,
    display_order: subject.displayOrder ?? appState.subjects.length + 1,
  };

  if (subject.id) {
    const row = await tablesClient.updateRow({
      databaseId: config.appwriteDatabaseId,
      tableId: getTableId("subjects"),
      rowId: subject.id,
      data: payload,
    });
    return { id: row.$id, slug: row.slug };
  }

  const row = await tablesClient.createRow({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId("subjects"),
    rowId: IdHelpers.unique(),
    data: payload,
  });

  return { id: row.$id, slug: row.slug };
}

async function saveChapterToSupabase(chapter) {
  const payload = {
    subject: chapter.subject,
    stream: chapter.stream,
    chapter_name: chapter.chapterName,
    chapter_order: chapter.chapterOrder,
  };

  if (chapter.id) {
    const row = await tablesClient.updateRow({
      databaseId: config.appwriteDatabaseId,
      tableId: getTableId("chapters"),
      rowId: chapter.id,
      data: payload,
    });
    return { id: row.$id };
  }

  const row = await tablesClient.createRow({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId("chapters"),
    rowId: IdHelpers.unique(),
    data: payload,
  });

  return { id: row.$id };
}

async function saveAssignmentToSupabase(assignment) {
  const normalizedDeadline = assignment.deadline ? new Date(`${assignment.deadline}T00:00:00`).toISOString() : null;
  const payload = {
    subject: assignment.subject,
    chapter: assignment.chapter,
    title: assignment.title,
    deadline: normalizedDeadline,
    question_link: assignment.questionLink || "",
    solution_link: assignment.solutionLink || "",
  };

  if (assignment.id) {
    const row = await tablesClient.updateRow({
      databaseId: config.appwriteDatabaseId,
      tableId: getTableId("assignments"),
      rowId: assignment.id,
      data: payload,
    });
    return { id: row.$id };
  }

  const row = await tablesClient.createRow({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId("assignments"),
    rowId: IdHelpers.unique(),
    data: payload,
  });

  return { id: row.$id };
}

async function saveUploadToSupabase(record) {
  const payload = {
    subject: record.subject,
    stream: record.stream,
    chapter: record.chapter,
    topic: record.topic,
    notice_title: record.noticeTitle,
    pdf_link: record.pdfLink || null,
    uploaded_on: record.uploadedOn || new Date().toISOString(),
  };

  if (record.id) {
    const row = await tablesClient.updateRow({
      databaseId: config.appwriteDatabaseId,
      tableId: getTableId("uploads"),
      rowId: record.id,
      data: payload,
    });
    return { id: row.$id };
  }

  const row = await tablesClient.createRow({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId("uploads"),
    rowId: IdHelpers.unique(),
    data: payload,
  });

  return { id: row.$id };
}

async function deleteRow(table, id) {
  await tablesClient.deleteRow({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId(table),
    rowId: id,
  });
}

async function updateRowsByFilters(table, filters, payload) {
  const rows = await listTableRows(table);
  const matches = rows.filter((row) =>
    Object.entries(filters).every(([column, value]) => row[column] === value)
  );

  await Promise.all(
    matches.map((row) =>
      tablesClient.updateRow({
        databaseId: config.appwriteDatabaseId,
        tableId: getTableId(table),
        rowId: getRowId(row),
        data: payload,
      })
    )
  );
}

async function deleteRowsByFilters(table, filters) {
  const rows = await listTableRows(table);
  const matches = rows.filter((row) =>
    Object.entries(filters).every(([column, value]) => row[column] === value)
  );

  await Promise.all(matches.map((row) => deleteRow(table, getRowId(row))));
}

function getReadableErrorMessage(error, fallbackMessage) {
  const rawMessage = String(error?.message || "").trim();
  const lowered = rawMessage.toLowerCase();

  if (lowered.includes("failed to fetch") || lowered.includes("networkerror") || lowered.includes("load failed")) {
    return "Could not reach Appwrite. Please check your internet connection, firewall/VPN, project platform settings, and whether the Appwrite project is active.";
  }

  return rawMessage || fallbackMessage;
}

async function saveSettingsToSupabase(settings) {
  const payload = {
    hero_eyebrow: settings.heroEyebrow,
    hero_title: settings.heroTitle,
    hero_copy: settings.heroCopy,
  };

  if (appState.settings.id) {
    const row = await tablesClient.updateRow({
      databaseId: config.appwriteDatabaseId,
      tableId: getTableId("siteSettings"),
      rowId: appState.settings.id,
      data: payload,
    });
    appState.settings.id = row.$id;
    return;
  }

  const row = await tablesClient.createRow({
    databaseId: config.appwriteDatabaseId,
    tableId: getTableId("siteSettings"),
    rowId: IdHelpers.unique(),
    data: payload,
  });

  appState.settings.id = row.$id;
}

async function handleUploadSubmit(uploadForm) {
  const formData = new FormData(uploadForm);
  const subject = formData.get("subject")?.toString().trim();
  const stream = formData.get("stream")?.toString().trim();
  const chapter = formData.get("chapter")?.toString().trim();
  const topic = formData.get("topic")?.toString().trim();
  const noticeTitle = formData.get("noticeTitle")?.toString().trim();
  const pdfLink = formData.get("pdfLink")?.toString().trim();
  const normalizedChapter = normalizeUploadChapter(stream, chapter);

  if (!subject || !stream || !normalizedChapter || !topic || !noticeTitle) {
    setMessage("error", "Please fill subject, type, chapter, topic, and notice title.");
    render();
    return;
  }

  if (!appState.backend.supabaseReady) {
    setMessage("error", "Appwrite is not connected. Please check your database and tables.");
    render();
    return;
  }

  appState.isSubmittingUpload = true;
  clearMessage();
  render();

  try {
    const uploadRecord = {
      subject,
      stream,
      chapter: normalizedChapter,
      topic,
      noticeTitle: `${subject} ${noticeTitle}`,
      pdfLink: pdfLink || "",
      uploadedOn: new Date().toISOString(),
      date: formatDateLabel(new Date().toISOString()),
    };

    const saved = await saveUploadToSupabase(uploadRecord);
    uploadRecord.id = saved?.id || Date.now();
    appState.uploads.unshift(uploadRecord);
    appState.backend.usingFallbackData = false;
    uploadForm.reset();
    setMessage("success", "Upload saved to Appwrite and dashboard updated.");
  } catch (error) {
    console.error(error);
    setMessage("error", getReadableErrorMessage(error, "Upload failed."));
  } finally {
    appState.isSubmittingUpload = false;
    render();
  }
}

async function handleAdminLogin(loginForm) {
  const formData = new FormData(loginForm);
  const username = formData.get("adminUsername")?.toString().trim();
  const password = formData.get("adminPassword")?.toString().trim();

  if (!username || !password) {
    setMessage("error", "Please enter email and password.");
    render();
    return;
  }

  try {
    clearMessage();
    await accountClient.createEmailPasswordSession({
      email: username,
      password,
    });

    const user = await accountClient.get();
    await applyAdminSession(user);
    if (!appState.admin.loggedIn && !appState.admin.canUpload) {
      await accountClient.deleteSessions();
      await applyAdminSession(null);
      setMessage("error", "This account is not configured as admin or uploader.");
      render();
      return;
    }

    if (appState.admin.loggedIn) {
      setMessage("success", "Admin login successful.");
      navigate({ page: "admin" });
    } else {
      setMessage("success", "Uploader login successful.");
      navigate({ page: "uploader" });
    }
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Admin login failed."));
    render();
  }
}

async function handleUploaderLogin(loginForm) {
  const formData = new FormData(loginForm);
  const email = formData.get("uploaderEmail")?.toString().trim();
  const password = formData.get("uploaderPassword")?.toString().trim();

  if (!email || !password) {
    setMessage("error", "Please enter email and password.");
    render();
    return;
  }

  try {
    clearMessage();
    await accountClient.createEmailPasswordSession({
      email,
      password,
    });

    const user = await accountClient.get();
    await applyAdminSession(user);
    if (!appState.admin.canUpload) {
      await accountClient.deleteSessions();
      await applyAdminSession(null);
      setMessage("error", "This account is not configured as uploader.");
      render();
      return;
    }

    if (appState.admin.loggedIn) {
      setMessage("success", "Admin login successful.");
      navigate({ page: "admin" });
    } else {
      setMessage("success", "Uploader login successful.");
      navigate({ page: "uploader" });
    }
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Uploader login failed."));
    render();
  }
}

async function logoutAdmin() {
  try {
    if (accountClient) {
      await accountClient.deleteSessions();
    }
  } catch (error) {
    console.error(error);
  }

  await applyAdminSession(null);
  appState.admin.section = "subjects";
  setMessage("info", "Admin logged out.");
  render();
}

function closeAdminModal(event) {
  if (event) {
    event.stopPropagation();
  }
  appState.admin.modal = null;
  render();
}

function startEditSubject(id) {
  appState.admin.modal = { type: "subject", id };
  render();
}

function startEditChapter(id) {
  appState.admin.modal = { type: "chapter", id };
  render();
}

function startEditAssignment(id) {
  appState.admin.modal = { type: "assignment", id };
  render();
}

function startEditUpload(id) {
  appState.admin.modal = { type: "upload", id };
  render();
}

async function handleAdminSubjectSubmit(form) {
  const formData = new FormData(form);
  const name = formData.get("subjectName")?.toString().trim();
  const accent = formData.get("subjectAccent")?.toString().trim();
  const description = formData.get("subjectDescription")?.toString().trim();

  if (!name || !accent || !description) {
    setMessage("error", "Please fill all subject fields.");
    render();
    return;
  }

  const subject = { name: formatLabel(name), accent: accent.toUpperCase(), description };

  try {
    const saved = await saveSubjectToSupabase(subject);
    appState.subjects.push({ id: saved?.id || Date.now(), slug: saved?.slug || slugify(subject.name), name: subject.name, accent: subject.accent, description: subject.description });
    setMessage("success", "Subject saved.");
    form.reset();
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not save subject."));
    render();
  }
}

async function handleAdminChapterSubmit(form) {
  const formData = new FormData(form);
  const subject = formData.get("chapterSubject")?.toString().trim();
  const stream = formData.get("chapterStream")?.toString().trim();
  const chapterName = formData.get("chapterName")?.toString().trim();
  const chapterOrder = Number(formData.get("chapterOrder"));

  if (!subject || !stream || !chapterName || !chapterOrder) {
    setMessage("error", "Please fill all chapter fields.");
    render();
    return;
  }

  const chapter = { subject, stream, chapterName: formatLabel(chapterName), chapterOrder };

  try {
    const saved = await saveChapterToSupabase(chapter);
    appState.chapters.push({ ...chapter, id: saved?.id || Date.now() });
    setMessage("success", "Chapter saved.");
    form.reset();
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not save chapter."));
    render();
  }
}

async function handleAdminAssignmentSubmit(form) {
  const formData = new FormData(form);
  const subject = formData.get("assignmentSubject")?.toString().trim();
  const chapter = formData.get("assignmentChapter")?.toString().trim();
  const title = formData.get("assignmentTitle")?.toString().trim();
  const deadline = formData.get("assignmentDeadline")?.toString().trim();
  const questionLink = formData.get("assignmentQuestionLink")?.toString().trim();
  const solutionLink = formData.get("assignmentSolutionLink")?.toString().trim();

  if (!subject || !chapter || !title) {
    setMessage("error", "Please fill subject, chapter, and title.");
    render();
    return;
  }

  const assignment = {
    subject,
    chapter,
    title,
    deadline,
    questionLink,
    solutionLink,
  };

  try {
    const saved = await saveAssignmentToSupabase(assignment);
    const viewAssignment = {
      ...assignment,
      id: saved?.id || Date.now(),
      deadline,
      deadlineLabel: formatDateLabel(deadline),
    };
    appState.assignments.unshift(viewAssignment);
    setMessage("success", "Assignment saved.");
    form.reset();
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not save assignment."));
    render();
  }
}

async function handleUploaderAssignmentSubmit(form) {
  const formData = new FormData(form);
  const subject = formData.get("uploaderAssignmentSubject")?.toString().trim();
  const chapter = formData.get("uploaderAssignmentChapter")?.toString().trim();
  const title = formData.get("uploaderAssignmentTitle")?.toString().trim();
  const deadline = formData.get("uploaderAssignmentDeadline")?.toString().trim();
  const questionLink = formData.get("uploaderAssignmentQuestionLink")?.toString().trim();
  const solutionLink = formData.get("uploaderAssignmentSolutionLink")?.toString().trim();

  if (!subject || !title) {
    setMessage("error", "Please fill subject and assignment title.");
    render();
    return;
  }

  try {
    const assignment = {
      subject,
      chapter,
      title,
      deadline,
      questionLink,
      solutionLink,
    };
    const saved = await saveAssignmentToSupabase(assignment);
    appState.assignments.unshift({
      ...assignment,
      id: saved?.id || Date.now(),
      deadline,
      deadlineLabel: formatDateLabel(deadline),
    });
    setMessage("success", "Assignment uploaded from uploader page.");
    form.reset();
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not save assignment."));
    render();
  }
}

async function handleAdminUploadSubmit(form) {
  const formData = new FormData(form);
  const subject = formData.get("adminUploadSubject")?.toString().trim();
  const stream = formData.get("adminUploadStream")?.toString().trim();
  const chapter = formData.get("adminUploadChapter")?.toString().trim();
  const topic = formData.get("adminUploadTopic")?.toString().trim();
  const noticeType = formData.get("adminUploadNoticeTitle")?.toString().trim();
  const pdfLink = formData.get("adminUploadPdfLink")?.toString().trim();
  const normalizedChapter = normalizeUploadChapter(stream, chapter);

  if (!subject || !stream || !normalizedChapter || !topic || !noticeType) {
    setMessage("error", "Please fill all upload fields.");
    render();
    return;
  }

  try {
    const uploadRecord = {
      subject,
      stream,
      chapter: normalizedChapter,
      topic,
      noticeTitle: `${subject} ${noticeType}`,
      pdfLink: pdfLink || "",
      uploadedOn: new Date().toISOString(),
      date: formatDateLabel(new Date().toISOString()),
    };

    const saved = await saveUploadToSupabase(uploadRecord);
    uploadRecord.id = saved?.id || Date.now();
    appState.uploads.unshift(uploadRecord);
    setMessage("success", "Upload saved from admin panel.");
    form.reset();
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not save upload."));
    render();
  }
}

async function handleModalSubjectSubmit(form) {
  const item = getAdminModalConfig();
  if (!item) {
    return;
  }

  const formData = new FormData(form);
  const subject = {
    id: item.id,
    name: formatLabel(formData.get("subjectName")?.toString().trim() || ""),
    accent: (formData.get("subjectAccent")?.toString().trim() || "").toUpperCase(),
    description: formData.get("subjectDescription")?.toString().trim() || "",
  };

  if (!subject.name || !subject.accent || !subject.description) {
    setMessage("error", "Please fill all subject fields.");
    render();
    return;
  }

  try {
    await saveSubjectToSupabase(subject);
    if (item.name !== subject.name) {
      await Promise.all([
        updateRowsByFilters("chapters", { subject: item.name }, { subject: subject.name }),
        updateRowsByFilters("assignments", { subject: item.name }, { subject: subject.name }),
        updateRowsByFilters("uploads", { subject: item.name }, { subject: subject.name }),
      ]);
    }

    appState.subjects = appState.subjects.map((entry) =>
      entry.id === subject.id ? { ...entry, ...subject, slug: slugify(subject.name) } : entry
    );
    appState.chapters = appState.chapters.map((entry) =>
      entry.subject === item.name ? { ...entry, subject: subject.name } : entry
    );
    appState.assignments = appState.assignments.map((entry) =>
      entry.subject === item.name ? { ...entry, subject: subject.name } : entry
    );
    appState.uploads = appState.uploads.map((entry) =>
      entry.subject === item.name ? { ...entry, subject: subject.name, noticeTitle: entry.noticeTitle.replace(item.name, subject.name) } : entry
    );
    setMessage("success", "Subject updated.");
    closeAdminModal();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not update subject."));
    render();
  }
}

async function handleModalChapterSubmit(form) {
  const item = getAdminModalConfig();
  if (!item) {
    return;
  }

  const formData = new FormData(form);
  const chapter = {
    id: item.id,
    subject: formData.get("chapterSubject")?.toString().trim() || "",
    stream: formData.get("chapterStream")?.toString().trim() || "",
    chapterName: formatLabel(formData.get("chapterName")?.toString().trim() || ""),
    chapterOrder: Number(formData.get("chapterOrder")),
  };

  if (!chapter.subject || !chapter.stream || !chapter.chapterName || !chapter.chapterOrder) {
    setMessage("error", "Please fill all chapter fields.");
    render();
    return;
  }

  try {
    await saveChapterToSupabase(chapter);
    const chapterChanged =
      item.subject !== chapter.subject ||
      item.stream !== chapter.stream ||
      item.chapterName !== chapter.chapterName;

    if (chapterChanged) {
      await Promise.all([
        updateRowsByFilters(
          "assignments",
          { subject: item.subject, chapter: item.chapterName },
          { subject: chapter.subject, chapter: chapter.chapterName }
        ),
        updateRowsByFilters(
          "uploads",
          { subject: item.subject, stream: item.stream, chapter: item.chapterName },
          { subject: chapter.subject, stream: chapter.stream, chapter: chapter.chapterName }
        ),
      ]);
    }

    appState.chapters = appState.chapters.map((entry) => (entry.id === chapter.id ? chapter : entry));
    appState.assignments = appState.assignments.map((entry) =>
      entry.subject === item.subject && entry.chapter === item.chapterName
        ? { ...entry, subject: chapter.subject, chapter: chapter.chapterName }
        : entry
    );
    appState.uploads = appState.uploads.map((entry) =>
      entry.subject === item.subject && entry.stream === item.stream && entry.chapter === item.chapterName
        ? {
            ...entry,
            subject: chapter.subject,
            stream: chapter.stream,
            chapter: chapter.chapterName,
            noticeTitle: entry.noticeTitle.replace(item.subject, chapter.subject),
          }
        : entry
    );
    setMessage("success", "Chapter updated.");
    closeAdminModal();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not update chapter."));
    render();
  }
}

async function handleModalAssignmentSubmit(form) {
  const item = getAdminModalConfig();
  if (!item) {
    return;
  }

  const formData = new FormData(form);
  const assignment = {
    id: item.id,
    subject: formData.get("assignmentSubject")?.toString().trim() || "",
    chapter: formData.get("assignmentChapter")?.toString().trim() || "",
    title: formData.get("assignmentTitle")?.toString().trim() || "",
    deadline: formData.get("assignmentDeadline")?.toString().trim() || "",
    questionLink: formData.get("assignmentQuestionLink")?.toString().trim() || "",
    solutionLink: formData.get("assignmentSolutionLink")?.toString().trim() || "",
  };

  if (!assignment.subject || !assignment.title) {
    setMessage("error", "Please fill subject and title.");
    render();
    return;
  }

  try {
    await saveAssignmentToSupabase(assignment);
    appState.assignments = appState.assignments.map((entry) =>
      entry.id === assignment.id
        ? { ...assignment, deadlineLabel: formatDateLabel(assignment.deadline) }
        : entry
    );
    setMessage("success", "Assignment updated.");
    closeAdminModal();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not update assignment."));
    render();
  }
}

async function handleModalUploadSubmit(form) {
  const item = getAdminModalConfig();
  if (!item) {
    return;
  }

  const formData = new FormData(form);
  const subject = formData.get("adminUploadSubject")?.toString().trim() || "";
  const stream = formData.get("adminUploadStream")?.toString().trim() || "";
  const chapter = formData.get("adminUploadChapter")?.toString().trim() || "";
  const topic = formData.get("adminUploadTopic")?.toString().trim() || "";
  const noticeType = formData.get("adminUploadNoticeTitle")?.toString().trim() || "";
  const pdfLink = formData.get("adminUploadPdfLink")?.toString().trim() || "";
  const normalizedChapter = normalizeUploadChapter(stream, chapter);

  if (!subject || !stream || !normalizedChapter || !topic || !noticeType) {
    setMessage("error", "Please fill all upload fields.");
    render();
    return;
  }

  const uploadRecord = {
    id: item.id,
    subject,
    stream,
    chapter: normalizedChapter,
    topic,
    noticeTitle: `${subject} ${noticeType}`,
    pdfLink,
    uploadedOn: item.uploadedOn || "",
    date: item.date,
  };

  try {
    await saveUploadToSupabase(uploadRecord);
    appState.uploads = appState.uploads.map((entry) => (entry.id === uploadRecord.id ? uploadRecord : entry));
    setMessage("success", "Upload updated.");
    closeAdminModal();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not update upload."));
    render();
  }
}

async function handleAdminSettingsSubmit(form) {
  const formData = new FormData(form);
  const settings = {
    ...appState.settings,
    heroEyebrow: formData.get("heroEyebrow")?.toString().trim() || appState.settings.heroEyebrow,
    heroTitle: formData.get("heroTitle")?.toString().trim() || appState.settings.heroTitle,
    heroCopy: formData.get("heroCopy")?.toString().trim() || appState.settings.heroCopy,
  };

  try {
    await saveSettingsToSupabase(settings);
    appState.settings = settings;
    setMessage("success", "Website settings saved.");
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not save website settings."));
    render();
  }
}

function setChapterSelectState(chapterSelect, streamName, options, emptyLabel, selectedValue = "") {
  if (!chapterSelect) {
    return;
  }

  if (isPyqStream(streamName)) {
    chapterSelect.disabled = true;
    chapterSelect.innerHTML = `<option value="PYQ" selected>No chapter needed for PYQ</option>`;
    return;
  }

  chapterSelect.disabled = false;
  const safeValue = options.includes(selectedValue) ? selectedValue : "";
  chapterSelect.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${renderSelectOptions(options, safeValue)}`;
}

function refreshUploadChapterOptions() {
  const subjectSelect = document.getElementById("subject");
  const streamSelect = document.getElementById("stream");
  const chapterSelect = document.getElementById("chapter");

  if (!subjectSelect || !streamSelect || !chapterSelect) {
    return;
  }

  const options = getChapterOptions(subjectSelect.value, streamSelect.value);
  setChapterSelectState(chapterSelect, streamSelect.value, options, "Select chapter");
}

function refreshAdminUploadChapterOptions() {
  const subjectSelect = document.getElementById("adminUploadSubject");
  const streamSelect = document.getElementById("adminUploadStream");
  const chapterSelect = document.getElementById("adminUploadChapter");

  if (!subjectSelect || !streamSelect || !chapterSelect) {
    return;
  }

  const options = getChapterOptions(subjectSelect.value, streamSelect.value);
  setChapterSelectState(chapterSelect, streamSelect.value, options, "Select chapter");
}

function refreshAssignmentChapterOptions() {
  const subjectSelect = document.getElementById("assignmentSubject");
  const chapterSelect = document.getElementById("assignmentChapter");

  if (!subjectSelect || !chapterSelect) {
    return;
  }

  const options = getAssignmentChapterOptions(subjectSelect.value);
  chapterSelect.innerHTML = `<option value="">Select chapter</option>${renderSelectOptions(options)}`;
}

function refreshUploaderAssignmentChapterOptions() {
  const subjectSelect = document.getElementById("uploaderAssignmentSubject");
  const chapterSelect = document.getElementById("uploaderAssignmentChapter");

  if (!subjectSelect || !chapterSelect) {
    return;
  }

  const options = getAssignmentChapterOptions(subjectSelect.value);
  chapterSelect.innerHTML = `<option value="">Select chapter</option>${renderSelectOptions(options)}`;
}

function resetSearchFilters() {
  appState.filters = {
    subject: "",
    stream: "",
    chapter: "",
  };
  render();
}

function refreshModalAssignmentChapterOptions() {
  const subjectSelect = document.getElementById("modalAssignmentSubject");
  const chapterSelect = document.getElementById("modalAssignmentChapter");

  if (!subjectSelect || !chapterSelect) {
    return;
  }

  const currentValue = chapterSelect.value;
  const options = getAssignmentChapterOptions(subjectSelect.value);
  chapterSelect.innerHTML = `<option value="">Select chapter</option>${renderSelectOptions(options, currentValue)}`;
}

function refreshModalUploadChapterOptions() {
  const subjectSelect = document.getElementById("modalUploadSubject");
  const streamSelect = document.getElementById("modalUploadStream");
  const chapterSelect = document.getElementById("modalUploadChapter");

  if (!subjectSelect || !streamSelect || !chapterSelect) {
    return;
  }

  const currentValue = chapterSelect.value;
  const options = getChapterOptions(subjectSelect.value, streamSelect.value);
  setChapterSelectState(chapterSelect, streamSelect.value, options, "Select chapter", currentValue);
}

function bindDynamicEvents() {
  const uploadForm = document.getElementById("uploadForm");
  if (uploadForm) {
    uploadForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleUploadSubmit(uploadForm);
    });
  }

  const uploadSubject = document.getElementById("subject");
  const uploadStream = document.getElementById("stream");
  if (uploadSubject) {
    uploadSubject.addEventListener("change", refreshUploadChapterOptions);
  }
  if (uploadStream) {
    uploadStream.addEventListener("change", refreshUploadChapterOptions);
  }
  if (uploadSubject || uploadStream) {
    refreshUploadChapterOptions();
  }

  const adminUploadSubject = document.getElementById("adminUploadSubject");
  const adminUploadStream = document.getElementById("adminUploadStream");
  if (adminUploadSubject) {
    adminUploadSubject.addEventListener("change", refreshAdminUploadChapterOptions);
  }
  if (adminUploadStream) {
    adminUploadStream.addEventListener("change", refreshAdminUploadChapterOptions);
  }
  if (adminUploadSubject || adminUploadStream) {
    refreshAdminUploadChapterOptions();
  }

  const assignmentSubject = document.getElementById("assignmentSubject");
  if (assignmentSubject) {
    assignmentSubject.addEventListener("change", refreshAssignmentChapterOptions);
  }

  const uploaderAssignmentSubject = document.getElementById("uploaderAssignmentSubject");
  if (uploaderAssignmentSubject) {
    uploaderAssignmentSubject.addEventListener("change", refreshUploaderAssignmentChapterOptions);
  }

  const modalAssignmentSubject = document.getElementById("modalAssignmentSubject");
  if (modalAssignmentSubject) {
    modalAssignmentSubject.addEventListener("change", refreshModalAssignmentChapterOptions);
  }

  const modalUploadSubject = document.getElementById("modalUploadSubject");
  const modalUploadStream = document.getElementById("modalUploadStream");
  if (modalUploadSubject) {
    modalUploadSubject.addEventListener("change", refreshModalUploadChapterOptions);
  }
  if (modalUploadStream) {
    modalUploadStream.addEventListener("change", refreshModalUploadChapterOptions);
  }
  if (modalUploadSubject || modalUploadStream) {
    refreshModalUploadChapterOptions();
  }

  const filterSubject = document.getElementById("filterSubject");
  const filterStream = document.getElementById("filterStream");
  const filterChapter = document.getElementById("filterChapter");
  if (filterSubject) {
    filterSubject.addEventListener("change", (event) => {
      appState.filters.subject = event.target.value;
      refreshSearchChapterOptions();
      updateSearchResults();
    });
  }
  if (filterStream) {
    filterStream.addEventListener("change", (event) => {
      appState.filters.stream = event.target.value;
      refreshSearchChapterOptions();
      updateSearchResults();
    });
  }
  if (filterChapter) {
    filterChapter.addEventListener("change", (event) => {
      appState.filters.chapter = event.target.value;
      updateSearchResults();
    });
  }
  if (filterSubject || filterStream || filterChapter) {
    refreshSearchChapterOptions();
  }

  const adminLoginForm = document.getElementById("adminLoginForm");
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminLogin(adminLoginForm);
    });
  }

  const uploaderLoginForm = document.getElementById("uploaderLoginForm");
  if (uploaderLoginForm) {
    uploaderLoginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleUploaderLogin(uploaderLoginForm);
    });
  }

  const adminSubjectForm = document.getElementById("adminSubjectForm");
  if (adminSubjectForm) {
    adminSubjectForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminSubjectSubmit(adminSubjectForm);
    });
  }

  const adminChapterForm = document.getElementById("adminChapterForm");
  if (adminChapterForm) {
    adminChapterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminChapterSubmit(adminChapterForm);
    });
  }

  const adminAssignmentForm = document.getElementById("adminAssignmentForm");
  if (adminAssignmentForm) {
    adminAssignmentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminAssignmentSubmit(adminAssignmentForm);
    });
  }

  const uploaderAssignmentForm = document.getElementById("uploaderAssignmentForm");
  if (uploaderAssignmentForm) {
    uploaderAssignmentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleUploaderAssignmentSubmit(uploaderAssignmentForm);
    });
  }

  const adminUploadForm = document.getElementById("adminUploadForm");
  if (adminUploadForm) {
    adminUploadForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminUploadSubmit(adminUploadForm);
    });
  }

  const adminSettingsForm = document.getElementById("adminSettingsForm");
  if (adminSettingsForm) {
    adminSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleAdminSettingsSubmit(adminSettingsForm);
    });
  }

  const modalSubjectForm = document.getElementById("modalSubjectForm");
  if (modalSubjectForm) {
    modalSubjectForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleModalSubjectSubmit(modalSubjectForm);
    });
  }

  const modalChapterForm = document.getElementById("modalChapterForm");
  if (modalChapterForm) {
    modalChapterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleModalChapterSubmit(modalChapterForm);
    });
  }

  const modalAssignmentForm = document.getElementById("modalAssignmentForm");
  if (modalAssignmentForm) {
    modalAssignmentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleModalAssignmentSubmit(modalAssignmentForm);
    });
  }

  const modalUploadForm = document.getElementById("modalUploadForm");
  if (modalUploadForm) {
    modalUploadForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleModalUploadSubmit(modalUploadForm);
    });
  }
}

function bindAndroidBackButton() {
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (!appPlugin?.addListener) {
    return;
  }

  appPlugin.addListener("backButton", () => {
    const handled = goBackInApp();
    if (!handled && appPlugin.exitApp) {
      appPlugin.exitApp();
    }
  });
}

async function initializeApp() {
  applyTheme(getStoredTheme());
  bindAndroidBackButton();

  try {
    await initializeBackend();
    await initializeBackendAuth();
    await loadRemoteData();
    startRemoteRefreshLoop();
  } catch (error) {
    console.error(error);
    appState.backend.lastError = error?.message || "Unknown Appwrite error";
    setMessage("info", `Appwrite query failed: ${error?.message || "Unknown error"}`);
  }

  render();

  let lastDayKey = getDateKey(new Date());
  window.setInterval(() => {
    const nextDayKey = getDateKey(new Date());
    if (nextDayKey !== lastDayKey) {
      lastDayKey = nextDayKey;
      render();
    }
  }, 60000);
}

window.setMode = setMode;
window.navigate = navigate;
window.openExternalLink = openExternalLink;
window.toggleTheme = toggleTheme;
window.setAdminSection = setAdminSection;
window.logoutAdmin = logoutAdmin;
window.resetSearchFilters = resetSearchFilters;
window.startEditSubject = startEditSubject;
window.startEditChapter = startEditChapter;
window.startEditAssignment = startEditAssignment;
window.startEditUpload = startEditUpload;
window.closeAdminModal = closeAdminModal;
window.deleteSubject = async (id) => {
  if (!window.confirm("Delete this subject?")) {
    return;
  }
  try {
    const subject = appState.subjects.find((item) => item.id === id);
    if (subject) {
      await Promise.all([
        deleteRowsByFilters("chapters", { subject: subject.name }),
        deleteRowsByFilters("assignments", { subject: subject.name }),
        deleteRowsByFilters("uploads", { subject: subject.name }),
      ]);
    }
    await deleteRow("subjects", id);
    appState.subjects = appState.subjects.filter((item) => item.id !== id);
    if (subject) {
      appState.chapters = appState.chapters.filter((item) => item.subject !== subject.name);
      appState.assignments = appState.assignments.filter((item) => item.subject !== subject.name);
      appState.uploads = appState.uploads.filter((item) => item.subject !== subject.name);
    }
    setMessage("success", "Subject deleted.");
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not delete subject."));
    render();
  }
};
window.deleteChapter = async (id) => {
  if (!window.confirm("Delete this chapter?")) {
    return;
  }
  try {
    const chapter = appState.chapters.find((item) => item.id === id);
    if (chapter) {
      await Promise.all([
        deleteRowsByFilters("assignments", { subject: chapter.subject, chapter: chapter.chapterName }),
        deleteRowsByFilters("uploads", { subject: chapter.subject, stream: chapter.stream, chapter: chapter.chapterName }),
      ]);
    }
    await deleteRow("chapters", id);
    appState.chapters = appState.chapters.filter((item) => item.id !== id);
    if (chapter) {
      appState.assignments = appState.assignments.filter(
        (item) => !(item.subject === chapter.subject && item.chapter === chapter.chapterName)
      );
      appState.uploads = appState.uploads.filter(
        (item) => !(item.subject === chapter.subject && item.stream === chapter.stream && item.chapter === chapter.chapterName)
      );
    }
    setMessage("success", "Chapter deleted.");
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not delete chapter."));
    render();
  }
};
window.deleteAssignment = async (id) => {
  if (!window.confirm("Delete this assignment?")) {
    return;
  }
  try {
    await deleteRow("assignments", id);
    appState.assignments = appState.assignments.filter((item) => item.id !== id);
    setMessage("success", "Assignment deleted.");
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not delete assignment."));
    render();
  }
};
window.deleteUpload = async (id) => {
  if (!window.confirm("Delete this upload?")) {
    return;
  }
  try {
    await deleteRow("uploads", id);
    appState.uploads = appState.uploads.filter((item) => item.id !== id);
    setMessage("success", "Upload deleted.");
    render();
  } catch (error) {
    setMessage("error", getReadableErrorMessage(error, "Could not delete upload."));
    render();
  }
};

initializeApp();
