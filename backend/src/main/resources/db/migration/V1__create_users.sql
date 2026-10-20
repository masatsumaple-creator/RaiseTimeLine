CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    handle        VARCHAR(30)  NOT NULL,
    display_name  VARCHAR(50)  NOT NULL,
    bio           VARCHAR(160),
    avatar_key    VARCHAR(500),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));
CREATE UNIQUE INDEX uq_users_handle_lower ON users (lower(handle));
