export default function LoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <form>
        <input name="email" type="email" />
        <input name="password" type="password" />
        <button type="submit">Sign in</button>
      </form>
      <button type="button">Continue with Google</button>
    </main>
  );
}
