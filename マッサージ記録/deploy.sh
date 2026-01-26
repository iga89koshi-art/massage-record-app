#!/bin/bash

# エラーが発生したら停止
set -e

echo "🚀 デプロイ準備を開始します..."

# git初期化
if [ ! -d ".git" ]; then
  git init
  echo "✅ git init 完了"
else
  echo "ℹ️ .git は既に存在します"
fi

# ファイル追加
git add .
echo "✅ git add 完了"

# コミット
git commit -m "First commit: Massage Record App v1.0" || echo "ℹ️ コミットする変更がありません"
echo "✅ git commit 完了"

# ブランチ名変更
git branch -M main

# リモート設定（既に設定されている場合はスキップまたは上書き）
if git remote | grep -q 'origin'; then
  git remote set-url origin https://github.com/iga89koshi-art/massage-record-app.git
  echo "✅ リモートURLを更新しました"
else
  git remote add origin https://github.com/iga89koshi-art/massage-record-app.git
  echo "✅ リモートURLを設定しました"
fi

# プッシュ
echo "📤 GitHubへアップロード中..."
git push -u origin main

echo ""
echo "🎉 アップロード完了！"
echo "次のステップ："
echo "1. GitHubのリポジトリページを開く"
echo "2. Settings > Pages に移動"
echo "3. Branchで 'main' を選択して Save"
echo "4. 数分待つとURLが表示されます"
