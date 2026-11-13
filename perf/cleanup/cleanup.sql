-- perf_ プレフィックスのユーザーと、そのユーザーが作ったデータをすべて削除する。
-- DB 名のガードは付けていない(perf 用でない DB に誤って投入された場合の安全網)。
-- 削除対象を perf_ ユーザーに限っているので、他のデータには触れない(FK の ON DELETE CASCADE で連動)。
\set ON_ERROR_STOP on
DELETE FROM users WHERE handle LIKE 'perf\_%';
