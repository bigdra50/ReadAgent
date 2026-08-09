---
description: アーキテクチャ上の決定を ADR として記録する
argument-hint: "<決定の要旨>"
allowed-tools: Read, Write, Bash(ls:*), Glob
---

決定: $ARGUMENTS

`docs/adr/` の既存ファイルを見て次の連番を決め、`docs/adr/NNNN-<kebab-case-title>.md` を
`docs/adr/template.md` の構成で作成してください。

守ること:

- **Context** には、いま分かっている制約だけを書く。将来の憶測を書かない。
- **Decision** は能動態・断定で書く（「〜する」）。
- **Consequences** には利点だけでなく、この決定で払うコスト・閉ざされる選択肢も書く。
- 却下した案は、なぜ却下したかを1行添えて残す。

作成後、ファイルパスと Decision の1行要約を報告してください。
