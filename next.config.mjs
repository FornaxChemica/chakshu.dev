/** @type {import('next').NextConfig} */
const nextConfig = {
	async rewrites() {
		return {
			beforeFiles: [
				{
					source: "/favicon.ico",
					destination: "/favicon/favicon-32x32.png",
				},
				{
					source: "/music",
					destination: "/music/index.html",
				},
			],
		};
	},
};

export default nextConfig;

if (process.env.NODE_ENV === "development") {
	import("@opennextjs/cloudflare").then((m) =>
		m.initOpenNextCloudflareForDev(),
	);
}
