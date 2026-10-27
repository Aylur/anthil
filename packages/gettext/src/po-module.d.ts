declare module "*.po" {
  const messages: import("@anthil/gettext/vanilla").PoJson
  export default messages
}
