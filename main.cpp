#include <stdio.h>

#include <windows.h>

#include <AclUI.h>

int main()
{
    CreateSecurityPage(NULL);
    HMODULE handle = LoadLibraryExW(L"comctl32", 0, 0);
    FARPROC proc = GetProcAddress(handle, (LPCSTR)(intptr_t)71);
    // EditSecurityAdvanced();
    printf("%p", proc);
    return 0;
}