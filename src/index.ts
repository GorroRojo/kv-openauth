import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { Resend } from "resend";
import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { CodeUI } from "@openauthjs/openauth/ui/code";

// This value should be shared between the OpenAuth server Worker and other
// client Workers that you connect to it, so the types and schema validation are
// consistent.
const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // This top section is just for demo purposes. In a real setup another
    // application would redirect the user to this Worker to be authenticated,
    // and after signing in or registering the user would be redirected back to
    // the application they came from. In our demo setup there is no other
    // application, so this Worker needs to do the initial redirect and handle
    // the callback redirect on completion.
    const url = new URL(request.url);
    if (url.pathname === "/") {
      url.searchParams.set("redirect_uri", url.origin + "/callback");
      url.searchParams.set("client_id", "your-client-id");
      url.searchParams.set("response_type", "code");
      url.pathname = "/authorize";
      return Response.redirect(url.toString());
    } else if (url.pathname === "/callback") {
      return Response.json({
        message: "OAuth flow complete!",
        params: Object.fromEntries(url.searchParams.entries()),
      });
    }

    // The real OpenAuth server code starts here:
    return issuer({
      storage: CloudflareStorage({
        namespace: env.AUTH_STORAGE,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            // eslint-disable-next-line @typescript-eslint/require-await
            sendCode: async (email: string, code: string) => {
              const resend = new Resend(env.RESEND_KEY);
              const data = await resend.emails.send({
                from: "Kinky Vibe Robotite <beepboop@kinkyvibe.ar>",
                to: [email],
                subject: "El código para tu cuenta de Kinky Vibe",
                html: `<p>Tu código es ${code}</p>`,
              });
              console.log(`Sending code ${code} to ${email}`);
              console.log(data);
            },
            copy: {
              button_continue: "Continuar",
              change_prompt: "¿Olvidaste tu contraseña?",
              code_resend: "Volver a mandar código",
              code_return: "Volver a",
              error_email_taken: "Ya existe una cuenta con esta dirección de correo",
              error_invalid_code: "El código es incorrecto.",
              error_invalid_email: "La dirección de correo no es válida.",
              error_invalid_password: "La contraseña no es válida.",
              error_password_mismatch: "Las contraseñas no coinciden.",
              error_validation_error: "La contraseña no cumple los requisitos.",
              input_code: "Código",
              input_email:"Dirección de correo",
              input_password:"Contraseña",
              input_repeat: "Repetir contraseña",
              login: "Ingresar",
              login_description: "Ingresar con tu correo",
              login_prompt: "¿Ya tenés una cuenta?",
              login_title: "Bienvenide al sitio", //???
              register: "Registrate",
              register_description: "Registrate con tu correo",
              register_prompt: "¿No tenés cuenta?",
              register_title: "Bienvenide al sitio", //???
              // validatePassword: (psw) => psw.length < 8 ? "La contraseña debe tener al menos 8 caracteres" : undefined

            },
          })
        ),
      },
      theme: {
        title: "Kinky Vibe",
        primary: "#f53dbb",
        favicon: "https://kinkyvibe.ar/favicon-32x32.png",
        logo: "https://kinkyvibe.ar/android-chrome-512x512.png",
        radius: "lg",
        background:"#eee"
      },
      success: async (ctx, value) => {
        return ctx.subject("user", {
          id: await getOrCreateUser(env, value.email),
        });
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`
  )
    .bind(email)
    .first<{ id: string }>();
  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }
  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}
