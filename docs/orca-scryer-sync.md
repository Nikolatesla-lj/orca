# orca-scryer 同步脚本

这个仓库有两个本地脚本，用来让 `orca-scryer` 分支持续跟上官方 Orca 的高频更新。

- `scripts/orca-scryer-watch.sh`：轻量检查官方 `origin/main` 是否有新提交。
- `scripts/orca-scryer-sync.sh`：发现更新后执行完整同步、rebase、测试和推送。

## 关键分支

- `origin/main`：官方仓库 `stablyai/orca` 的 `main`。
- `fork/main`：你的 fork 仓库 `Nikolatesla-lj/orca` 的 `main`。
- `orca-scryer`：我们正在开发的功能分支。

目标状态：

```text
origin/main = fork/main = 本地 main
orca-scryer = 最新 main + Scryer 集成功能
```

## watch 触发逻辑

`watch` 每次只做一件事：用 `git ls-remote origin refs/heads/main` 查询官方 `main` 当前提交号。

- 第一次运行：只记录当前提交号，不触发同步。
- 官方提交号没变：不做任何重操作。
- 官方提交号变了：调用 `scripts/orca-scryer-sync.sh`。

同步成功后，`watch` 才会把新的官方提交号写入状态文件。同步失败时不会推进状态，下一次检查还会重试。

状态和日志默认放在：

```text
.git/orca-scryer-sync/
.git/orca-scryer-sync/logs/
```

## sync 完整流程

`sync` 执行以下步骤：

1. 拉取官方 `origin/main`。
2. 拉取你的 `fork/main` 和 `fork/orca-scryer`。
3. 检查 `fork/main` 是否只落后官方 `main`，如果你的 fork main 有额外提交就停止。
4. 把 `fork/main` 快进到 `origin/main`。
5. 切到本地 `orca-scryer`。
6. 把本地 `main` 对齐到最新 `origin/main`。
7. 把 `orca-scryer` rebase 到最新 `origin/main`。
8. 跑检查：
   - focused unit tests
   - `pnpm run tc:web`
   - `pnpm run tc:node`
   - `oxlint`
   - `oxfmt --check .`
   - architecture live e2e
9. 全部通过后，用 `git push --force-with-lease fork orca-scryer` 更新远端功能分支。
10. 最后同步本地状态，让本地 `main`、本地 `orca-scryer` 和 GitHub 远端一致。

如果本地 `orca-scryer` 有未提交改动，脚本会先用 `git stash` 临时保存，完成同步后再恢复。`stash` 可以理解成“先把没提交的改动临时收起来”。

如果 rebase 冲突、测试失败或 stash 恢复失败，脚本不会推送 `orca-scryer`，并会保留日志和失败现场。

## 手动运行

只检查官方 main 是否变化：

```bash
scripts/orca-scryer-watch.sh
```

不等官方变化，直接跑完整同步：

```bash
scripts/orca-scryer-sync.sh
```

测试脚本自身的 watch 触发逻辑：

```bash
bash tests/scripts/orca-scryer-watch.test.sh
```

## 安装每 12 小时自动检查

运行：

```bash
scripts/orca-scryer-install-cron.sh
```

它会向当前用户的 crontab 写入这段任务：

```cron
0 */12 * * * /home/ljian/wspace/orca-scryer/orca/scripts/orca-scryer-watch.sh
```

查看已安装任务：

```bash
crontab -l
```

查看 cron 日志：

```bash
tail -n 200 .git/orca-scryer-sync/logs/watch-cron.log
```

## 常见失败

### fork main 有额外提交

脚本会停止，因为它不应该覆盖你的 fork main 上独有的提交。

处理方式：先人工确认这些提交是否要保留。

### rebase 冲突

脚本会停止，不推送 `orca-scryer`。

处理方式：进入仓库后运行：

```bash
git status
```

按 Git 提示解决冲突，然后继续或中止 rebase。

### 测试失败

脚本会停止，不推送 `orca-scryer`。

处理方式：打开 `.git/orca-scryer-sync/logs/` 里的最新日志，先修测试失败，再手动运行：

```bash
scripts/orca-scryer-sync.sh
```
