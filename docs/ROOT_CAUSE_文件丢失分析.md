# 文件丢失根因分析

## 结论（一句话）

**仓库里只有一次提交（Create Next App 初始提交），`docs/`、`lib/`、`components/`、`app/api/`、`supabase/` 等所有业务代码从未被 Git 跟踪；一旦执行了「还原到提交」或「清理未跟踪文件」，这些目录和文件就会从磁盘上消失。**

---

## 1. 当前 Git 状态（排查时）

- **仅有一次提交**：`bc16d75 Initial commit from Create Next App`
- **该提交里只有**：`.gitignore`、`README.md`、`app/`（layout、page、globals.css、favicon）、`public/`、`package.json`、`next.config.ts`、`tsconfig.json` 等**模板文件**
- **从未出现在任何提交里**：`docs/`、`lib/`、`components/`、`app/api/`、`supabase/migrations/`
- 因此 Git 一直把这些业务代码视为 **未跟踪（untracked）** 文件

---

## 2. 可能导致“文件没了”的操作

在「只有一次提交 + 业务代码全未跟踪」的前提下，下面任一情况都会导致你看到的现象（模板还在，业务代码和改动全没）：

| 可能操作 | 效果 |
|----------|------|
| **`git reset --hard`** 或 **`git checkout .`** | 把已修改的**已跟踪文件**（如 `page.tsx`、`globals.css`、`README.md`、`package.json`）还原成初始提交的版本 |
| **`git clean -fd`** 或 **`git clean -fdx`** | 删除所有**未跟踪**的文件和目录，即 `docs/`、`lib/`、`components/`、`app/api/`、`supabase/` 等会从磁盘消失 |
| **IDE 里“丢弃所有更改”/“Restore to last commit”** | 通常等于对已跟踪文件做 `checkout`，一般不会主动删未跟踪文件，除非该选项背后带了 clean |
| **IDE 里“清理未跟踪文件”/“Clean”** | 等价于 `git clean`，会删掉上述未跟踪目录 |
| **用“仅含初始提交”的副本覆盖当前项目**（例如重新克隆、从备份恢复错了） | 整个目录被替换成只有模板的状态，未提交的代码自然全没 |

无法从本机日志 100% 确定你当时点的是哪一步，但**根因一致**：业务代码从未入过 Git，且某次操作要么“还原了已跟踪文件 + 清理了未跟踪”，要么“用只有初始提交的版本覆盖了项目”。

---

## 3. 为何会“没有安全感”

- 没提交过的文件，Git 不负责保留；一旦被 clean 或目录被覆盖，就无法用 `git checkout` 恢复。
- 只有一次提交时，`git reset --hard` 会把所有已跟踪文件拉回“刚建项目”的状态，你之前对 `page.tsx`、`globals.css`、`README`、`package.json` 的修改也会一起没掉。

所以“文件没了”的直接原因不是 Git 坏了，而是：**这些改动从未被提交，且某次操作把未跟踪文件清掉或把项目还原/覆盖了。**

---

## 4. 建议（避免再次发生）

1. **立刻把当前代码纳入版本控制**  
   - 执行：  
     `git add docs/ lib/ components/ app/api/ supabase/ app/page.tsx app/globals.css README.md package.json package-lock.json`  
   - 然后：  
     `git commit -m "feat: 恢复并提交完整 stock-cloud 业务代码与文档"`  
   - 这样当前恢复出来的 `docs/`、`lib/`、`components/`、`app/api/`、`supabase/` 以及页面/依赖改动都会在历史里，以后可以用 `git checkout` 或 `git restore` 找回。

2. **以后养成习惯**  
   - 每做完一个功能或修完一个 bug 就 `git add` + `git commit`，避免大块“未跟踪 + 未提交”的代码长期存在。  
   - 在 IDE 里慎用“清理未跟踪文件”“Discard all”等，用前先确认没有重要未提交目录（如 `docs/`、`lib/`、`components/`）。

3. **可选：远程备份**  
   - 在 GitHub / Gitee 等新建仓库并 `git remote add origin <url>`，然后 `git push -u origin main`。  
   - 这样即使本机误操作，还可以从远程拉回。

---

## 5. 总结

| 问题 | 原因 |
|------|------|
| 为什么 `docs/`、`lib/` 等“没了”？ | 这些目录从未被 `git add` 过，一直是未跟踪；被 `git clean` 或目录覆盖就会从磁盘删除。 |
| 为什么 `page.tsx`、`globals.css` 等“回到默认”？ | 它们已在 Git 中，但被 `git reset --hard` 或等价操作还原到了唯一那次提交（Create Next App）的状态。 |
| 根因一句话 | **业务代码从未提交，且某次操作清理了未跟踪文件或把项目还原/覆盖到了只有初始提交的版本。** |

（文档写于排查当日，用于留存根因与防护建议。）

---

## 6. 稳定性：首次克隆/恢复后必做

- **确认业务代码已在版本控制中**：执行 `git status`，确认 `docs/`、`lib/`、`components/`、`app/`、`supabase/` 等无大量未跟踪文件；若存在，说明尚未做完整提交。
- **若为恢复后的副本或新克隆**：按上文「4. 建议」做一次完整提交（`git add docs/ lib/ components/ app/ supabase/ README.md package.json package-lock.json` 及有改动的配置文件，再 `git commit`），并建议推送到远程（`git push`），避免再次因误操作丢失代码。
