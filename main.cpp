#include <stdio.h>

#include <windows.h>

int main()
{
    HMODULE handle = LoadLibraryExW(L"comctl32", 0, 0);
    FARPROC proc = GetProcAddress(handle, (LPCSTR)(intptr_t)71);
    printf("%p", proc);
    return 0;
}