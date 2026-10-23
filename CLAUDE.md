# RaiseTimeLine

## バックエンド(MyBatis)の規約

- SQLは必ず `backend/src/main/resources/mapper/*.xml` に書く。`@Select` / `@Insert` / `@Update` / `@Delete` や `@*Provider` などのアノテーションでSQLを書かない。
- Mapperインターフェース(`backend/src/main/java/.../mapper/`)にはメソッド定義だけを置き、対応するXMLの `namespace` と `id` を合わせる。
- SELECT列の重複は `<sql>` と `<include>` でまとめ、動的な条件は `<where>` / `<if>` / `<foreach>` で書く。
- SQLは句(SELECT / FROM / WHERE など)ごとに改行し、1行に詰め込まない。
