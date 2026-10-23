export interface User {
  id: number
  handle: string
  displayName: string
  bio?: string
  avatarKey?: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: 'Bearer'
  /** アクセストークンの有効期間(秒) */
  expiresIn: number
  user: User
}

export interface ApiErrorBody {
  code: string
  message: string
  /** 入力検証エラー(400)のときの、項目名 → メッセージ */
  fieldErrors?: Record<string, string>
}

export interface PostAuthor {
  id: number
  handle: string
  displayName: string
  avatarKey?: string
}

export interface Post {
  id: number
  body: string
  /** ISO 8601 */
  createdAt: string
  /** 編集されていなければ null */
  editedAt: string | null
  author: PostAuthor
  likeCount: number
  likedByMe: boolean
  commentCount: number
}

export interface Comment {
  id: number
  postId: number
  body: string
  /** ISO 8601 */
  createdAt: string
  author: PostAuthor
  /** ログイン中のユーザー自身のコメントか(削除ボタンを出す) */
  mine: boolean
}

export interface CommentPage {
  /** 古い順 */
  items: Comment[]
  /** null なら最後のページ */
  nextCursor: string | null
}

export interface CommentCreated {
  comment: Comment
  commentCount: number
}

export interface LikeResult {
  likeCount: number
  likedByMe: boolean
}

export type TimelineTab = 'following' | 'all'

export interface TimelinePage {
  items: Post[]
  /** null なら最後のページ */
  nextCursor: string | null
}

export interface NewPosts {
  count: number
  /** true: 件数が上限を超えていて、items と手元の一覧の間に欠落がある */
  hasMore: boolean
  items: Post[]
}

export interface SignupInput {
  email: string
  password: string
  handle: string
  displayName: string
}

export interface UserProfile {
  id: number
  handle: string
  displayName: string
  bio?: string
  avatarKey?: string
  followingCount: number
  followerCount: number
  followedByMe: boolean
  /** ログイン中のユーザー自身のプロフィールか */
  isMe: boolean
}

export interface FollowResult {
  followedByMe: boolean
  followerCount: number
}

/** フォロー中 / フォロワー一覧の 1 行 */
export interface UserSummary {
  id: number
  handle: string
  displayName: string
  bio?: string
  avatarKey?: string
  followedByMe: boolean
  /** ログイン中のユーザー自身の行か(フォローボタンを出さない) */
  isMe: boolean
}

export interface UserPage {
  items: UserSummary[]
  /** null なら最後のページ */
  nextCursor: string | null
}
