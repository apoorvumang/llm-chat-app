export default function MercuryLogo({ size = 20, color = "currentColor" }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 28 28"
            fill="none"
        >
            <path
                fill={color}
                d="M17.056 0H8.528L0 8.528v8.528h8.528V8.528h8.528V0ZM10.2 27.256h8.529l8.528-8.528v-8.529H18.73v8.529h-8.528v8.528Z"
            />
        </svg>
    );
}
