# 王者内战 · 随机组队

一个手机端优先的群内长期报名网页，使用 Cloudflare Pages + Pages Functions + D1。

## 功能
- 全群共用长期报名名单
- 昵称报名，五个位置多选
- 查看、修改、删除报名
- 选择 10 人创建两队
- 后端回溯算法保证两队各有中路、打野、辅助、射手、边路
- 不满足条件时给出原因
- 保存最近 30 次分组记录
- 重新随机、复制分组结果

## 目录
- `public/`：网页静态文件
- `functions/api/[[path]].js`：API
- `schema.sql`：D1 数据库结构
- `wrangler.toml`：Cloudflare 配置模板

## 部署步骤

### 1. 创建 D1 数据库
在 Cloudflare Dashboard：
1. 打开 **Workers & Pages → D1**
2. 创建数据库，名称填写 `wangzhe-war-room`
3. 进入数据库的 Console，执行 `schema.sql` 全部 SQL

也可以使用 Wrangler：
```bash
npm install -g wrangler
wrangler login
wrangler d1 create wangzhe-war-room
```
把命令返回的 `database_id` 填入 `wrangler.toml`，然后执行：
```bash
wrangler d1 execute wangzhe-war-room --remote --file=./schema.sql
```

### 2. 部署到 Cloudflare Pages
最简单的方式：
1. 将整个项目上传到 GitHub 仓库
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. 选择仓库
4. Framework preset 选 `None`
5. Build command 留空
6. Build output directory 填 `public`
7. 创建项目

注意：Pages Functions 必须与静态目录一起部署。此项目的 `functions/` 目录放在项目根目录，Cloudflare Pages 会自动识别。

### 3. 绑定 D1
Pages 项目 → Settings → Functions → D1 database bindings：
- Variable name：`DB`
- D1 database：选择 `wangzhe-war-room`

保存后重新部署。

### 4. 初始化数据
如果还没有执行过 `schema.sql`，请在 D1 Console 执行一次。

### 5. 打开网址
部署成功后会获得 `https://你的项目.pages.dev`。把它发到微信群/QQ群即可。

## 本地预览
建议使用 Wrangler 本地运行（需要 Node.js）：
```bash
npm install -g wrangler
wrangler pages dev public --d1 DB=wangzhe-war-room
```
如果本地绑定数据库配置不成功，先按 Cloudflare Dashboard 部署步骤完成线上版本。

## 重要说明
- 当前版本按你的选择：所有访问者都能报名、修改、删除报名和创建分组，没有管理员账号。
- 因为没有账号系统，任何拿到链接的人都能操作公共名单。请只在可信群内分享。
- 昵称按不区分大小写检查重复；一个昵称只能报名一次。
- 删除报名时会同步从历史分组展示数据中保留当时的快照，不会篡改历史结果。
- 分组接口在服务端重新读取玩家位置并校验，不能只靠前端校验。
- 这是第一版，尚未加入账号验证、验证码、精细权限和防刷系统。若公开传播，建议后续加管理员口令或 Cloudflare Turnstile。
