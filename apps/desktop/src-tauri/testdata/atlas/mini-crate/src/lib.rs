//! Fixture: pub items, a trait impl, an axum-shaped router, private noise.

pub struct User {
    pub id: u64,
}

pub struct UserRepo;

pub trait Repo {
    fn find(&self, id: u64) -> Option<User>;
}

impl Repo for UserRepo {
    fn find(&self, _id: u64) -> Option<User> {
        None
    }
}

pub fn list_users() -> Vec<User> {
    Vec::new()
}

pub fn create_user() -> User {
    User { id: 1 }
}

fn internal_helper() -> u32 {
    41
}

pub fn router() -> Router {
    let _ = internal_helper();
    Router::new()
        .route("/users", get(list_users))
        .route("/users", post(create_user))
}

// Minimal axum-shaped stand-ins so the fixture is self-describing; the
// scanner reads syntax, it never compiles this crate.
pub struct Router;
impl Router {
    pub fn new() -> Self {
        Router
    }
    pub fn route(self, _p: &str, _h: Handler) -> Self {
        self
    }
}
pub struct Handler;
pub fn get<T>(_f: T) -> Handler {
    Handler
}
pub fn post<T>(_f: T) -> Handler {
    Handler
}
