# AWS Lambda Python 3.13ベースイメージを使用
FROM public.ecr.aws/lambda/python:3.13

# 作業ディレクトリを設定
WORKDIR ${LAMBDA_TASK_ROOT}

# uvのインストール
RUN pip install --no-cache-dir uv

# 依存関係ファイルをコピー
COPY requirements.txt .

# uvを使用して依存関係をインストール
RUN uv pip install --system --no-cache -r requirements.txt

# アプリケーションコードをコピー
COPY ./app ./app

# Lambda handler を設定
CMD ["app.main.handler"]
