import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";

/**
 * GET /api/docs
 *
 * Query params:
 * - slug: fetch a single doc by slug
 * - versions=true&doc_id=X: list versions for a doc
 * - (none): list all docs
 */
export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);

  // List versions for a doc
  if (searchParams.get("versions") === "true") {
    const docId = searchParams.get("doc_id");
    if (!docId) {
      return NextResponse.json(
        { error: "doc_id is required when fetching versions" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("doc_versions")
      .select("*")
      .eq("doc_id", Number(docId))
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ versions: data });
  }

  // Fetch single doc by slug
  const slug = searchParams.get("slug");
  if (slug) {
    const { data, error } = await supabase
      .from("docs")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ doc: data });
  }

  // List all docs
  const { data, error } = await supabase
    .from("docs")
    .select("id, slug, title, updated_at, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ docs: data });
}

/**
 * PUT /api/docs
 *
 * Update a doc. Saves current version to doc_versions before updating.
 * Body: { id, title, content }
 */
export async function PUT(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const body = await request.json();

  if (!body.id || !body.title || body.content === undefined) {
    return NextResponse.json(
      { error: "id, title, and content are required" },
      { status: 400 }
    );
  }

  // Fetch current version to save as a snapshot
  const { data: current, error: fetchError } = await supabase
    .from("docs")
    .select("*")
    .eq("id", body.id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json(
      { error: fetchError?.message || "Doc not found" },
      { status: 404 }
    );
  }

  // Save current state to doc_versions
  const { error: versionError } = await supabase
    .from("doc_versions")
    .insert({
      doc_id: current.id,
      title: current.title,
      content: current.content,
    });

  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  // Update the doc
  const { data: updated, error: updateError } = await supabase
    .from("docs")
    .update({
      title: body.title,
      content: body.content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ doc: updated });
}

/**
 * POST /api/docs
 *
 * Actions:
 * - { action: "restore", version_id, doc_id }: restore a version
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const body = await request.json();

  if (body.action === "restore") {
    if (!body.version_id || !body.doc_id) {
      return NextResponse.json(
        { error: "version_id and doc_id are required" },
        { status: 400 }
      );
    }

    // Fetch the version to restore
    const { data: version, error: versionFetchError } = await supabase
      .from("doc_versions")
      .select("*")
      .eq("id", body.version_id)
      .single();

    if (versionFetchError || !version) {
      return NextResponse.json(
        { error: versionFetchError?.message || "Version not found" },
        { status: 404 }
      );
    }

    // Fetch current doc to save as version first
    const { data: current, error: currentFetchError } = await supabase
      .from("docs")
      .select("*")
      .eq("id", body.doc_id)
      .single();

    if (currentFetchError || !current) {
      return NextResponse.json(
        { error: currentFetchError?.message || "Doc not found" },
        { status: 404 }
      );
    }

    // Save current state as a version
    const { error: saveError } = await supabase
      .from("doc_versions")
      .insert({
        doc_id: current.id,
        title: current.title,
        content: current.content,
      });

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    // Restore the version
    const { data: restored, error: restoreError } = await supabase
      .from("docs")
      .update({
        title: version.title,
        content: version.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.doc_id)
      .select()
      .single();

    if (restoreError) {
      return NextResponse.json(
        { error: restoreError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ doc: restored });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
