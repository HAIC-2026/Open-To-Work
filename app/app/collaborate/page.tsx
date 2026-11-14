import { redirect } from "next/navigation"

/** Collaborate is now a mode of the New page; keep old links working. */
export default function CollaboratePage() {
  redirect("/new?mode=collaborate")
}
