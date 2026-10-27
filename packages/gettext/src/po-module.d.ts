declare module "*.po" {
  const messages: import("@anthil/gettext").PoJson
  export default messages
}
