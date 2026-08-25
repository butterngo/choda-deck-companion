---
requirement: "Projects/Workspace audit view: view code history/commit, file tree đóng mở được, view doc + mermaid diagram, bấm commit xem title + task documentation — để audit toàn bộ: task nào sửa gì, tại sao, link ADR nào, đổi file/dòng nào"
started: 2026-08-25
workspace: Companion
status: converged
---

# Discovery — Workspace audit view (commit → task → ADR → lý do)

Thread: CONV-1787630938979-1

## Round 1 — what already exists, and what the record cannot answer

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| conversation | (round 0 — thread opened, no messages yet) | CONV-1787630938979-1 |
| code | Chiều task → ADR + files + commits ĐÃ SHIP. `GET /tasks/:id` trả `adrs[] / files[] / commits[] / filesConfidence`. Cái Butter xin phần lớn là chiều NGƯỢC LẠI. | packages/web/src/api.ts:384-435 |
| code | `ProvenanceFile` chỉ có `path, workspaceId, relation, exists` — KHÔNG có line range. "Đổi dòng nào" hiện không có nguồn dữ liệu nào. | packages/web/src/api.ts:414-420 |
| code | `ProvenanceCommit` = `raw, sha, subject, workspaceId, sessionId` — không có diff, không có body, không có author/date. | packages/web/src/api.ts:422-428 |
| code | Bài toán được chính codebase phát biểu: "the three questions that currently cost a terminal: which ADR decided this task, which files it changed, at which commit". | packages/web/src/components/TaskProvenance.tsx:1-2 |
| code | UI đã có tiền lệ phân biệt "không đổi file nào" vs "không xác định được" (`filesConfidence: undeterminable`) — chuẩn trung thực cho audit view phải kế thừa. | packages/web/src/components/TaskProvenance.tsx:12-17, api.ts:435 |
| ADR | `commits[]` được server derive bằng `git log` trên session window, **lọc theo task-ID tag trong subject**. Đây là toàn bộ cơ chế nối commit ↔ task đang có. | ADR-031-session-end-derivation, §Tier 1 |
| ADR | Graph có sẵn `TOUCHES` (task ↔ code_ref, quan hệ `modifies\|reference`) và code_ref chấp nhận "line-drift tolerance" — tức anchor theo symbol, cố ý KHÔNG pin theo dòng. | ADR-032-unified-knowledge-graph-v2, §graph primitives / P2 |
| measurement | Commit có TASK-id: companion **82/130 (63%)**, choda-deck **299/541 (55%)**. ~40-45% lịch sử không quy được về task nếu chỉ dựa vào subject. | `git log --format=%s \| grep -cE "TASK-[0-9]+"`, cả hai repo, 2026-08-25 |
| measurement | Phần không tag chủ yếu là `chore(release):` + feature cũ trước khi có thói quen tag — không phải toàn rác. | `git log --format=%s \| grep -v TASK`, companion |
| deps | `react-markdown` ✓, `@radix-ui/react-collapsible` ✓ (tree đóng/mở gần như free). **mermaid KHÔNG có** — là dependency mới. `remark-gfm` cũng không có → bảng markdown hiện không render. | packages/web/package.json:14-25 |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Butter phát biểu trực tiếp; codebase tự ghi nhận cùng nỗi đau (TaskProvenance.tsx:1-2); và đo được 45% commit không quy về task — đúng cái audit hiện không trả lời nổi | — |
| 2 | Scope & boundary | 5 | Biết cái gì IN (4 gạch đầu dòng của Butter). Chưa chốt cái gì OUT: diff sâu tới đâu, mermaid ở đâu, có cross-repo không, có audit ngược từ ADR không | Butter chốt (§Round 2 hỏi) |
| 3 | Technical contract | 6 | Chiều task→provenance đọc hết ở api.ts:384-435. Chưa đọc: route docs tree, route knowledge, có route git/commit-list/diff nào không, schema code_refs có lưu line không | đọc adapter http-server.ts + schema |
| 4 | Prior art & constraints | 7 | ADR-031 (commits derive + lọc task-id) và ADR-032 (TOUCHES, line-drift cố ý bỏ) đều governing. Gap: chưa soát xem từng có ADR nào từ chối "diff viewer / git surface" trong companion chưa | knowledge_search cho git/diff/adapter surface |
| 5 | Edges & failure | 6 | Biết 3 lớp gãy: commit không tag (45%), file không còn trên đĩa (đã xử lý ở FileRow), filesConfidence undeterminable. Chưa biết: repo không có trên máy, commit không nằm trong session nào, diff khổng lồ/binary, sha bị rebase mất | trace adapter khi workspace.cwd không tồn tại |
| 6 | NFR | 4 | Biết một rủi ro thật: `GET /tasks` đã 4MB không filter (TASK-1773), và audit view sẽ đọc nhiều hơn thế. Chưa trả lời 11/12 hạng mục; bundle cost của mermaid chưa đo | chạy checklist + đo mermaid |
| 7 | Acceptance criteria | 2 | Chưa viết. Bị chặn bởi #3 — viết AC trên contract chưa đọc thì round sau viết lại | sau khi #3 lên 9 |

**TOTAL = MIN = 2** (dimension 7)
Previous round: — (round 0 = 1) → this round: 2. New evidence? **YES** (11 nguồn) → may continue.

### Score history
| # | Dimension | R1 |
|---|---|---|
| 1 | Problem & value | 9 |
| 2 | Scope & boundary | 5 |
| 3 | Technical contract | 6 |
| 4 | Prior art | 7 |
| 5 | Edges & failure | 6 |
| 6 | NFR | 4 |
| 7 | Acceptance criteria | 2 |
| | **MIN** | **2** |

### Round 2 will look for exactly this
- Đọc đầy đủ route của companion adapter: có route git/commit/diff/docs-tree nào không (#3 — mở khoá #7)
- Schema `code_refs`: có cột start/end line không (#3 — quyết định "đổi dòng nào" có khả thi không)
- Hỏi Butter 3 câu boundary: diff sâu tới đâu, mermaid ở đâu, commit không tag xử lý sao (#2)
- Đo bundle cost của mermaid (#6)

## Round 2 — contract mapped, boundary chốt, và hai cái bẫy

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| conversation | Butter chốt 3 boundary: (a) v1 chỉ `--stat`, full diff là task sau; (b) commit không tag vẫn HIỆN, đánh dấu "không rõ task"; (c) mermaid chỉ trong docs view, lazy-load, kèm remark-gfm | [conversation CONV-1787630938979-1] |
| code | Route table đầy đủ. **Không có** `/commits`, `/git`, `/diff`, `/touches`, `/code_refs` — grep 5 pattern → 0 hit | src/adapters/companion/http-server.ts:48-183 |
| code | Không có bảng commit. Commit chỉ sống trong `sessions.handoff_json` (JSON blob), phần tử dạng `"<short-sha> <subject>"` | schema.ts:571, task-types.ts:169, knowledge-git.ts:58 |
| code | **Năng lực git server-side ĐÃ CÓ**: `GitOps.commitsInWindow(cwd, since, grepTaskId)` chạy `git log` qua subprocess. `--stat` là mở rộng của cái đang có, không phải surface mới | knowledge-git.ts:57-63 |
| code | **Không có index ngược commit→task.** Không code nào parse TASK-id RA TỪ commit message; `splitCommit` chỉ tách sha/subject. Liên kết hiện chỉ suy được qua session | task-provenance.ts:86-91 |
| code | `code_refs` chỉ có `line_hint INTEGER` nullable, và tool tự mô tả *"not trustworthy over time"*. Không có startLine/endLine ở đâu | schema.ts:738, code-ref-tools.ts:28 |
| code | ADR link thực tế rất thưa: 1/39 qua frontmatter, 38/39 chỉ nhắc trong prose ⇒ `collectAdrs` phải **đọc body của cả 39 ADR** cho MỖI task | task-provenance.ts:10-12, :144-178 |
| code | `DocTree` cố ý không collapse (*"Folders start open"*), adapter trả path phẳng vì *"a tree is a rendering concern"*. Radix collapsible đã có sẵn trong deps ⇒ đóng/mở là việc nhỏ | DocTree.tsx:1-7, :69, workspace-docs.ts:137 |
| code | `/workspace-docs` trả 409 kèm label+cwd khi cwd không tồn tại — tiền lệ tốt cho error state của history | workspace-docs.ts:150-158 |
| code | **Bẫy 1 — GitOps nuốt lỗi:** `catch { return [] }`, comment *"best-effort, never fatal"*. Với audit view, [] im lặng = "không có commit nào", đúng kiểu confidently-wrong mà `filesConfidence` sinh ra để chống | knowledge-git.ts:68-71 |
| measurement | **Bẫy 2 — sha trong handoff là sha TRƯỚC squash:** 4/4 sha kiểm tra (bf781db, 915f191, 78637ef, db70bf7) đều `ORPHAN-not-on-main`. Còn resolve được ở máy này vì object chưa gc; trên clone mới thì không tồn tại | `git merge-base --is-ancestor <sha> origin/main`, companion, 2026-08-25 |
| measurement | 39 ADR type=decision / 108 file knowledge. Audit list 130 commit × 39 file = ~5000 lượt đọc file nếu làm ngây thơ mỗi commit một lần | `grep -l "^type: decision" docs/knowledge/*.md`, choda-deck |
| measurement | mermaid 11.17.1 unpackedSize 84 MB. Installer companion đã 196 MB ⇒ lazy chunk là bắt buộc, không phải tối ưu | `npm view mermaid dist.unpackedSize` |
| code | Cả 4 workspace của choda-deck đều là git repo hợp lệ ⇒ nhánh "không phải repo" là edge hiếm nhưng vẫn phải xử lý đúng | `git -C <cwd> rev-parse --git-dir` ×4 |

### NFR — 12/12
| Category | Requirement | Source |
|---|---|---|
| Performance | History page < 1s. `git log` giới hạn 100 commit/trang, có phân trang. ADR index đọc MỘT lần cho cả trang, không phải mỗi commit | Stated default + đo 39×130 |
| Scalability | Lịch sử chỉ tăng tuyến tính, 1 người dùng. Phân trang là đủ | Assumed |
| Availability | Không SLA — app local | Default |
| Security | Token-gated như `/workspace-docs` và `/tasks/:id`. Chỉ đọc, không bao giờ chạy git ghi | workspace-docs.ts:131 |
| Observability | Không thêm gì — reuse health context của shell | Assumed |
| Error Handling | **Không bao giờ nuốt lỗi git thành list rỗng.** Repo lỗi → error state riêng; sha không resolve → đánh dấu từng dòng | knowledge-git.ts:68-71 (phản ví dụ) |
| Data | Không lưu gì mới. Đọc git ở thời điểm đọc | Stated (a) |
| i18n | English UI như phần còn lại của app | Default |
| Accessibility | Tree đóng/mở phải là `<button aria-expanded>`; không link tới thứ không tồn tại (tiền lệ FileRow) | TaskProvenance.tsx:5-8 |
| Compliance | Không áp dụng — công cụ cá nhân, local | Default |
| Maintainability | Nằm trong `/workspaces/:id` đã có, không tạo pillar mới | Stated |
| Integration | Chỉ git subprocess + adapter routes có sẵn. Không hệ thống ngoài | knowledge-git.ts:57 |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | (carry R1) codebase tự ghi nhận nỗi đau + 45% commit không quy về task | — |
| 2 | Scope & boundary | 9 | IN: history list, stat, tree đóng/mở, mermaid trong docs, commit→task→ADR. OUT (Butter chốt): full diff viewer, mermaid ngoài docs, đoán task từ session window | — |
| 3 | Technical contract | 9 | Route table đầy đủ + schema đầy đủ, biết chính xác cái gì thiếu và substrate nào có sẵn (GitOps, task_code_refs, handoff) | — |
| 4 | Prior art & constraints | 9 | ADR-031 (commit derive), ADR-032 (line-drift cố ý bỏ), DocTree "folders start open", workspace-docs "tree is a rendering concern". Không ADR nào từng từ chối git surface | — |
| 5 | Edges & failure | 9 | 7 nhánh gãy có bằng chứng: sha orphan sau squash (4/4 đo được), git nuốt lỗi, cwd 409, traversal, file exists=false, filesConfidence undeterminable, line_hint không tin được | — |
| 6 | NFR | 9 | 12/12 trả lời, 3 rủi ro ĐO được: 39 ADR/task, mermaid 84 MB, /tasks 4 MB | — |
| 7 | Acceptance criteria | 9 | 9 AC dưới đây, mỗi cái nêu surface, một verdict, và pass/fail cho ra output khác nhau | — |

**TOTAL = MIN = 9**
Previous round: 2 → this round: 9. New evidence? **YES** (15 nguồn) → converged.

### Score history
| # | Dimension | R1 | R2 |
|---|---|---|---|
| 1 | Problem & value | 9 | 9 |
| 2 | Scope & boundary | 5 | 9 |
| 3 | Technical contract | 6 | 9 |
| 4 | Prior art | 7 | 9 |
| 5 | Edges & failure | 6 | 9 |
| 6 | NFR | 4 | 9 |
| 7 | Acceptance criteria | 2 | 9 |
| | **MIN** | **2** | **9** |

### Acceptance criteria
- [ ] AC-1 — Mở `/workspaces/:id` tab History: mỗi row hiện short sha, subject, ngày, và badge task. Fail: bỏ badge task khỏi row → test đỏ.
- [ ] AC-2 — Commit không mang TASK-id vẫn xuất hiện, mang badge "không rõ task". Fail: số row < số dòng `git log` của cùng khoảng → test đỏ.
- [ ] AC-3 — Trỏ workspace vào thư mục không phải git repo: view hiện error state "không đọc được lịch sử git" kèm cwd. Fail: hiện danh sách rỗng / "0 commits" → test đỏ. (Đây là AC chống lại `catch { return [] }` ở knowledge-git.ts:68.)
- [ ] AC-4 — Bấm một commit: panel hiện subject đầy đủ, body, và `--stat` (từng file kèm +n/−m). Fail: panel không có file nào khi commit sửa file → test đỏ.
- [ ] AC-5 — Commit có TASK-id: panel hiện task title + link tới `/tasks/:id`, và danh sách ADR liên quan tới task đó. Fail: commit `(TASK-1767)` không nối được tới TASK-1767 → test đỏ.
- [ ] AC-6 — Sha ghi trong session handoff nhưng không resolve được trong repo (trường hợp orphan sau squash): dòng đó đánh dấu "commit không còn trong repo", không crash, không 500. Fail: request 500 hoặc dòng hiện như commit bình thường → test đỏ.
- [ ] AC-7 — DocTree: bấm folder thì đóng/mở; mặc định mở; trạng thái giữ nguyên khi chọn file khác. Fail: bỏ state → test đỏ.
- [ ] AC-8 — Doc chứa block ```mermaid render thành SVG. Doc KHÔNG chứa mermaid thì chunk mermaid không được tải. Fail: assert dynamic import bị gọi trên doc không mermaid → test đỏ.
- [ ] AC-9 — Bảng markdown GFM render thành `<table>`. Fail: bảng ra plain text → test đỏ.
- [ ] AC-10 — Trang History 100 commit đọc index ADR đúng MỘT lần, không phải một lần mỗi commit. Fail: đếm số lượt đọc knowledge > 1 cho một trang → test đỏ.
