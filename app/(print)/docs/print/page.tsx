import { createServerClient } from "@/lib/supabase/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const dynamic = "force-dynamic";

export default async function DocsPrintPage() {
  const supabase = createServerClient();

  const { data: doc, error } = await supabase
    .from("docs")
    .select("*")
    .eq("slug", "cheat-sheet")
    .single();

  if (error || !doc) {
    return (
      <div className="p-12 text-center text-red-600">
        Failed to load document.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[8.5in] min-h-screen bg-white text-black px-[1in] py-[0.75in] print:px-0 print:py-0">
      <h1 className="text-3xl font-bold mb-2">{doc.title}</h1>
      <p className="text-sm text-gray-500 mb-8">
        Last updated: {new Date(doc.updated_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <div className="prose prose-base max-w-none text-black prose-headings:text-black prose-p:text-black prose-li:text-black prose-strong:text-black prose-a:text-black prose-a:underline prose-thead:border-gray-300 prose-tr:border-gray-200 prose-th:text-black prose-td:text-black">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ children, href, ...props }) => (
              <a href={href} {...props}>
                {children}
              </a>
            ),
            h2: ({ children, ...props }) => (
              <>
                <hr className="my-8 border-gray-300" />
                <h2 className="text-2xl font-semibold text-black" {...props}>
                  {children}
                </h2>
              </>
            ),
          }}
        >
          {doc.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
